/**
 * Permanent internal/operator script -- NOT part of the application
 * runtime, and NOT a public route. Phase 11C (payload-based tasks), Step
 * 2: creates one payload source for an existing template and adds one or
 * more payload items to it, using the same createPayloadSource /
 * addPayloadItems primitives Step 2 introduced -- no separate write path.
 *
 * Content arguments are stored exactly as passed, opaque text, never
 * fetched or interpreted -- including anything that looks like a URL.
 *
 * Usage:
 *   npx tsx scripts/seed-payload-source.ts <templateId> <label> <item1> [item2] [item3] ...
 *
 * Example:
 *   npx tsx scripts/seed-payload-source.ts 3f2b... "batch-1" "Summarize https://example.com/a" "Summarize https://example.com/b"
 */
import {
  addPayloadItems,
  createPayloadSource,
} from "@/services/marketplace/payloadSourcesService";

async function main() {
  const [templateId, label, ...contents] = process.argv.slice(2);

  if (!templateId || !label || contents.length === 0) {
    console.error(
      "Usage: npx tsx scripts/seed-payload-source.ts <templateId> <label> <item1> [item2] ..."
    );
    process.exit(1);
  }

  const source = await createPayloadSource({ templateId, label });
  console.log("Created payload source:");
  console.log("  id:        ", source.id);
  console.log("  templateId:", source.templateId);
  console.log("  status:    ", source.status);

  const items = await addPayloadItems(source.id, contents);
  console.log(`\nAdded ${items.length} payload item(s):`);
  for (const item of items) {
    console.log(`  ${item.id}  (${item.content.length} chars)`);
  }
}

main().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
