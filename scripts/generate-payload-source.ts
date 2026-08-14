/**
 * Permanent internal/operator script -- NOT part of the application
 * runtime, and NOT a public route. Phase 11C (payload-based tasks),
 * AI-Assisted Supply: drafts a batch of payload content for an existing
 * template via Claude, then persists it through the exact same
 * createPayloadSource / addPayloadItems primitives Step 2 already
 * introduced (with kind='ai_generated') -- no separate write path, and no
 * database logic lives in this file itself.
 *
 * generatePayloadContent() (lib/ai/generatePayloadContent.ts) never
 * touches the database -- it only drafts and defensively validates
 * content in memory. This script is the only thing that persists it, and
 * it does so purely by calling the same unmodified primitives a human
 * operator already uses via scripts/seed-payload-source.ts.
 *
 * Usage:
 *   npx tsx scripts/generate-payload-source.ts <templateId> <label> [hint]
 *
 * Example:
 *   npx tsx scripts/generate-payload-source.ts 3f2b... "ai-batch-1" "URLs of public product pages to summarize"
 */
import { getTemplateById } from "@/services/marketplace/taskTemplatesService";
import {
  addPayloadItems,
  createPayloadSource,
} from "@/services/marketplace/payloadSourcesService";
import { generatePayloadContent } from "@/lib/ai/generatePayloadContent";

async function main() {
  const [templateId, label, hint] = process.argv.slice(2);

  if (!templateId || !label) {
    console.error(
      "Usage: npx tsx scripts/generate-payload-source.ts <templateId> <label> [hint]"
    );
    process.exit(1);
  }

  const template = await getTemplateById(templateId);
  if (!template) {
    console.error(`No task template with id "${templateId}" exists.`);
    process.exit(1);
  }

  console.log(`Drafting payload content for template "${template.title}"...`);
  const drafts = await generatePayloadContent(
    {
      title: template.title,
      description: template.description,
      category: template.category,
      difficulty: template.difficulty,
    },
    hint ? { hint } : undefined
  );
  console.log(`Claude proposed ${drafts.length} item(s).`);

  const source = await createPayloadSource({ templateId, label, kind: "ai_generated" });
  console.log("\nCreated payload source:");
  console.log("  id:        ", source.id);
  console.log("  templateId:", source.templateId);
  console.log("  kind:      ", source.kind);
  console.log("  status:    ", source.status);

  const items = await addPayloadItems(source.id, drafts);
  console.log(`\nAdded ${items.length} payload item(s):`);
  for (const item of items) {
    console.log(`  ${item.id}  (${item.content.length} chars)`);
  }
}

main().catch((err) => {
  console.error("AI-assisted seeding failed:", err);
  process.exit(1);
});
