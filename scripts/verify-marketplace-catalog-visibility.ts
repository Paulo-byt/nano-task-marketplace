/**
 * Tester catalog visibility fix: read-only verification against the live
 * database. No writes -- application creation is checked at the LOGIC
 * level (the same isActiveTierTemplate condition app/api/applications/route.ts
 * relies on), not via a real POST that would create a live application row
 * for a test wallet.
 *
 * Covers:
 *   C. paused templates are excluded from marketplace listings.
 *   D. a new application to a paused template would be rejected (logic-level).
 *   E. existing payload/template data for paused templates is untouched.
 *   F. active templates remain applyable (both listing-eligible and
 *      correctly recognized by isActiveTierTemplate).
 *
 * Usage: npx tsx scripts/verify-marketplace-catalog-visibility.ts
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

let total = 0;
let failed = 0;
const failures: string[] = [];

function assertTrue(condition: boolean, message: string) {
  total++;
  if (!condition) {
    failed++;
    failures.push(message);
  }
}

async function main() {
  const { db } = await import("../db");
  const { taskTemplates, tasks, payloadItems } = await import("../db/schema");
  const { and, eq, inArray, sql } = await import("drizzle-orm");
  const { getTasks } = await import("../services/marketplace/mockTasks");
  const { isActiveTierTemplate, ACTIVE_TEMPLATE_TITLES } = await import(
    "../lib/evaluation/platformGroundTruth"
  );

  const templates = await db
    .select({ id: taskTemplates.id, title: taskTemplates.title, status: taskTemplates.status })
    .from(taskTemplates);

  const activeTitles: Set<string> = new Set(Object.values(ACTIVE_TEMPLATE_TITLES));
  const pausedTemplateIds = new Set(
    templates.filter((t) => t.status !== "active").map((t) => t.id)
  );
  const activeTemplateIds = new Set(
    templates.filter((t) => t.status === "active" && activeTitles.has(t.title)).map((t) => t.id)
  );

  console.log(`Live templates: ${templates.length} total, ${pausedTemplateIds.size} paused, ${activeTemplateIds.size} active-tier.\n`);

  // --- F (part 1): isActiveTierTemplate correctly recognizes every real active id
  for (const id of activeTemplateIds) {
    const result = await isActiveTierTemplate(id);
    assertTrue(result === true, `F: isActiveTierTemplate(${id}) should be true for a real active-tier template`);
  }

  // --- D: isActiveTierTemplate correctly rejects every real paused id (the
  // exact boolean app/api/applications/route.ts's new check relies on)
  for (const id of pausedTemplateIds) {
    const result = await isActiveTierTemplate(id);
    assertTrue(
      result === false,
      `D: isActiveTierTemplate(${id}) should be false for a paused template -- a new application would be rejected`
    );
  }

  // --- C: marketplace listing excludes every open task on a paused template
  const page = await getTasks({ pageSize: 200 });
  const listedTaskIds = new Set(page.tasks.map((t) => t.id));

  const openPausedTasks =
    pausedTemplateIds.size === 0
      ? []
      : await db
          .select({ id: tasks.id, templateId: tasks.templateId })
          .from(tasks)
          .where(
            and(
              eq(tasks.status, "open"),
              eq(tasks.fundingStatus, "funded"),
              inArray(tasks.templateId, [...pausedTemplateIds])
            )
          );

  let leakedPausedTasks = 0;
  for (const t of openPausedTasks) {
    if (listedTaskIds.has(t.id)) leakedPausedTasks++;
  }
  assertTrue(
    leakedPausedTasks === 0,
    `C: ${leakedPausedTasks} open task(s) belonging to a paused template appeared in the marketplace listing`
  );
  console.log(
    `C: checked ${openPausedTasks.length} open+funded task(s) on paused templates; ${leakedPausedTasks} leaked into the listing.`
  );

  // --- F (part 2): an open task on an active-tier template DOES still list
  const openActiveTasks = await db
    .select({ id: tasks.id, templateId: tasks.templateId })
    .from(tasks)
    .where(sql`${tasks.status} = 'open' AND ${tasks.fundingStatus} = 'funded' AND ${tasks.templateId} IS NOT NULL`);
  const relevantActive = openActiveTasks.filter((t) => t.templateId && activeTemplateIds.has(t.templateId));
  let missingFromListing = 0;
  for (const t of relevantActive) {
    if (!listedTaskIds.has(t.id)) missingFromListing++;
  }
  assertTrue(
    missingFromListing === 0,
    `F: ${missingFromListing} open active-tier task(s) were unexpectedly missing from the marketplace listing`
  );
  console.log(
    `F: checked ${relevantActive.length} open+funded active-tier task(s); ${missingFromListing} missing from the listing.`
  );

  // --- E: existing payload/template row counts unchanged by this fix (this
  // fix touches no rows at all -- read-time filters only)
  const counts = await db
    .select({ templateId: payloadItems.templateId, n: sql<number>`count(*)::int` })
    .from(payloadItems)
    .groupBy(payloadItems.templateId);
  let anyNot20 = 0;
  for (const row of counts) {
    if (row.n !== 20) anyNot20++;
  }
  assertTrue(
    anyNot20 === 0 && counts.length === templates.length,
    `E: expected every one of ${templates.length} templates to still have exactly 20 payload items; ${anyNot20} did not`
  );
  console.log(`E: ${counts.length} templates checked, all with exactly 20 payload items (unchanged).`);

  console.log(`\n${total - failed}/${total} passed.`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(" - " + f);
  }
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
