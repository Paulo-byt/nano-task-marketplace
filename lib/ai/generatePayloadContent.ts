import Anthropic from "@anthropic-ai/sdk";
import { anthropic, CLAUDE_MODEL } from "@/lib/ai/client";
import { MAX_PAYLOAD_ITEM_CONTENT_LENGTH } from "@/services/marketplace/payloadSourcesService";

export class PayloadContentGenerationError extends Error {}

// Phase 11C, AI-Assisted Supply: the approved v1 bound -- a single forced
// tool call returns a whole batch (1-10 items), never one API call per
// item. Deliberately duplicated as a literal here rather than imported
// from anywhere -- there is no existing shared "batch size" constant to
// reuse, the same "nothing to share yet" reasoning as this codebase's
// other duplicated validation constants.
const MIN_BATCH_SIZE = 1;
const MAX_BATCH_SIZE = 10;

export interface PayloadTemplateContext {
  title: string;
  description: string;
  category: string;
  difficulty: string;
}

const PROPOSE_PAYLOAD_ITEMS_TOOL: Anthropic.Tool = {
  name: "propose_payload_items",
  description:
    "Propose a batch of payload content items for a payload-sourced task template.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: { type: "string" },
        minItems: MIN_BATCH_SIZE,
        maxItems: MAX_BATCH_SIZE,
      },
    },
    required: ["items"],
  },
};

function buildSystemPrompt(count: number): string {
  return `You are drafting payload content for a payload-sourced task template on Nano Task Marketplace, a platform where people complete small tasks for small USDC rewards.

A payload item is NOT a task description. It is the specific, opaque piece of input material that one generated task instance will be built around -- for example a URL to summarize, a short prompt to respond to, or a brief to work from. The task's own title, description, category, difficulty, and reward all come from its template, unchanged; you are only drafting the per-instance input material the template's instructions will be applied to.

Propose exactly ${count} distinct payload items using the propose_payload_items tool. Requirements for each item:
- Plain text only, under ${MAX_PAYLOAD_ITEM_CONTENT_LENGTH} characters.
- Consistent with the template's own title, description, category, and difficulty below.
- Distinct from the other items in this batch -- do not repeat the same item.
- No task instructions, no reward amounts, no category/difficulty labels -- just the raw input material itself.`;
}

function buildUserMessage(template: PayloadTemplateContext, hint?: string): string {
  const hintLine = hint ? `\n\nOperator hint: ${hint}` : "";
  return `Template title: ${template.title}
Template description: ${template.description}
Template category: ${template.category}
Template difficulty: ${template.difficulty}${hintLine}`;
}

/**
 * Defensive re-validation of Claude's tool-call output, the same
 * never-trust-one-layer ethic as generateTask.ts's isValidDraft --
 * independent of, and in addition to, addPayloadItems' own validation,
 * which remains the final persistence boundary regardless of what this
 * function returns.
 */
function isValidBatch(value: unknown): value is { items: string[] } {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as Record<string, unknown>;

  if (!Array.isArray(draft.items)) return false;
  if (draft.items.length < MIN_BATCH_SIZE || draft.items.length > MAX_BATCH_SIZE) {
    return false;
  }

  return draft.items.every(
    (item) =>
      typeof item === "string" &&
      item.trim().length > 0 &&
      item.length <= MAX_PAYLOAD_ITEM_CONTENT_LENGTH
  );
}

/**
 * Drafts a batch of 1-10 payload content strings for a payload-sourced
 * template. Pure with respect to the database: nothing here ever reads or
 * writes payload_sources/payload_items or any other table -- it returns
 * validated strings only. Persisting them is the caller's job, via the
 * existing, unmodified createPayloadSource/addPayloadItems primitives
 * (see scripts/generate-payload-source.ts), exactly the same
 * draft-then-caller-persists split as generateTaskDraft/POST-/api/tasks.
 *
 * count is clamped to [1, 10] before ever reaching the prompt -- an
 * out-of-range request is corrected here rather than silently forwarded
 * to Claude or left to fail validation after a wasted API call.
 */
export async function generatePayloadContent(
  template: PayloadTemplateContext,
  opts?: { count?: number; hint?: string }
): Promise<string[]> {
  const count = Math.min(
    MAX_BATCH_SIZE,
    Math.max(MIN_BATCH_SIZE, opts?.count ?? MAX_BATCH_SIZE)
  );

  let response;
  try {
    response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system: buildSystemPrompt(count),
      messages: [{ role: "user", content: buildUserMessage(template, opts?.hint) }],
      tools: [PROPOSE_PAYLOAD_ITEMS_TOOL],
      tool_choice: { type: "tool", name: "propose_payload_items" },
    });
  } catch (err) {
    throw new PayloadContentGenerationError(
      `Failed to reach Claude: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new PayloadContentGenerationError("Claude did not return a tool call.");
  }

  const draft = toolUse.input;
  if (!isValidBatch(draft)) {
    throw new PayloadContentGenerationError("Claude's response failed validation.");
  }

  return draft.items.map((item) => item.trim());
}
