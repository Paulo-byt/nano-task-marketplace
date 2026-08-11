import Anthropic from "@anthropic-ai/sdk";
import { anthropic, CLAUDE_MODEL } from "@/lib/ai/client";
import type { TaskDraft } from "@/types/ai";

export class TaskGenerationError extends Error {}

// Deliberately duplicated from app/api/tasks/route.ts rather than shared --
// see the cumulative technical-debt backlog ("duplicated reward bounds
// constants"), which this now makes a third instance of. Left alone on
// purpose for this step.
const ALLOWED_CATEGORIES = ["Writing", "AI", "Research", "Design", "Social"] as const;
const ALLOWED_DIFFICULTIES = ["Beginner", "Intermediate", "Advanced"] as const;
const MIN_REWARD_USDC = 0.01;
const MAX_REWARD_USDC = 5.0;
const MAX_TITLE_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 1000;

const SYSTEM_PROMPT = `You are drafting a micro-task for Nano Task Marketplace, a platform where anyone with a crypto wallet posts small tasks with small USDC rewards ($${MIN_REWARD_USDC}-$${MAX_REWARD_USDC}) that another person can complete quickly, often in minutes.

Propose exactly one task using the propose_task tool. Requirements:
- title: concise and specific, under ${MAX_TITLE_LENGTH} characters.
- description: a clear, actionable description of exactly what the worker must do, under ${MAX_DESCRIPTION_LENGTH} characters.
- category: exactly one of ${ALLOWED_CATEGORIES.join(", ")}.
- difficulty: exactly one of ${ALLOWED_DIFFICULTIES.join(", ")}.
- estimatedTime: a short realistic estimate, e.g. "10 min" or "1 hour".
- rewardUsdc: a fair reward between $${MIN_REWARD_USDC} and $${MAX_REWARD_USDC}, scaled to the task's difficulty and time.

The task must be completable independently by one person, with no special equipment, in well under a day.`;

const PROPOSE_TASK_TOOL: Anthropic.Tool = {
  name: "propose_task",
  description: "Propose a single micro-task draft for the marketplace.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      category: { type: "string", enum: [...ALLOWED_CATEGORIES] },
      difficulty: { type: "string", enum: [...ALLOWED_DIFFICULTIES] },
      estimatedTime: { type: "string" },
      rewardUsdc: { type: "number" },
    },
    required: [
      "title",
      "description",
      "category",
      "difficulty",
      "estimatedTime",
      "rewardUsdc",
    ],
  },
};

/**
 * Defensive re-validation of Claude's tool-call output -- the tool schema
 * constrains shape, but nothing upstream is trusted blindly, the same
 * "never trust one layer" ethic as the rest of this codebase (e.g.
 * evaluatePayoutReceipt in lib/arc/verifyPayout.ts). The eventual
 * POST /api/tasks call re-validates a third time, independent of this.
 */
function isValidDraft(value: unknown): value is TaskDraft {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as Record<string, unknown>;

  return (
    typeof draft.title === "string" &&
    draft.title.trim().length > 0 &&
    draft.title.length <= MAX_TITLE_LENGTH &&
    typeof draft.description === "string" &&
    draft.description.trim().length > 0 &&
    draft.description.length <= MAX_DESCRIPTION_LENGTH &&
    typeof draft.category === "string" &&
    (ALLOWED_CATEGORIES as readonly string[]).includes(draft.category) &&
    typeof draft.difficulty === "string" &&
    (ALLOWED_DIFFICULTIES as readonly string[]).includes(draft.difficulty) &&
    typeof draft.estimatedTime === "string" &&
    draft.estimatedTime.trim().length > 0 &&
    typeof draft.rewardUsdc === "number" &&
    Number.isFinite(draft.rewardUsdc) &&
    draft.rewardUsdc >= MIN_REWARD_USDC &&
    draft.rewardUsdc <= MAX_REWARD_USDC
  );
}

export async function generateTaskDraft(hint?: string): Promise<TaskDraft> {
  const userMessage = hint
    ? `Generate a task idea related to: ${hint}`
    : "Generate a task idea.";

  let response;
  try {
    response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      tools: [PROPOSE_TASK_TOOL],
      tool_choice: { type: "tool", name: "propose_task" },
    });
  } catch (err) {
    throw new TaskGenerationError(
      `Failed to reach Claude: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new TaskGenerationError("Claude did not return a tool call.");
  }

  const draft = toolUse.input;
  if (!isValidDraft(draft)) {
    throw new TaskGenerationError("Claude's response failed validation.");
  }

  return {
    title: draft.title.trim(),
    description: draft.description.trim(),
    category: draft.category,
    difficulty: draft.difficulty,
    estimatedTime: draft.estimatedTime.trim(),
    rewardUsdc: Math.round(draft.rewardUsdc * 100) / 100,
  };
}
