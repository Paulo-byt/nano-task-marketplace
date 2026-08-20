/**
 * Post-incident fix: pure, no-database, no-network unit test for
 * lib/evaluation/platformGroundTruth.ts's computeActiveTemplateRegistry --
 * the title-based resolution logic that replaced the hardcoded
 * task_templates UUID map. Deliberately exercises this against entirely
 * FABRICATED ids (never the real ones) to prove the logic keys on title
 * alone and is genuinely indifferent to what the real ids happen to be --
 * this is the direct regression test for the incident where a hardcoded
 * UUID map would have silently gone stale after a database rebuild.
 *
 * Permanent verification script. Usage:
 *   npx tsx scripts/verify-active-template-registry.ts
 */
import {
  computeActiveTemplateRegistry,
  ACTIVE_TEMPLATE_TITLES,
  type ActiveTemplateKey,
  type TemplateTitleRow,
} from "../lib/evaluation/platformGroundTruth";

const EXPECTED_KEYS = Object.keys(ACTIVE_TEMPLATE_TITLES) as ActiveTemplateKey[];

function fakeId(seed: string): string {
  // Well-formed UUID-shaped strings, but never anything resembling a real
  // seeded database id -- the whole point is that these could be ANY
  // string shape at all and the logic still has to work purely off title.
  return `${seed.repeat(8).slice(0, 8)}-${seed.repeat(4).slice(0, 4)}-4${seed.repeat(3).slice(0, 3)}-8${seed.repeat(3).slice(0, 3)}-${seed.repeat(12).slice(0, 12)}`;
}

function rowsFrom(idBySeedPrefix: string): TemplateTitleRow[] {
  return (Object.entries(ACTIVE_TEMPLATE_TITLES) as [ActiveTemplateKey, string][]).map(
    ([key, title], index) => ({
      id: fakeId(`${idBySeedPrefix}${index}`),
      title,
    })
  );
}

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

// --- Test A: resolves correctly from stable identity (title) -------------
{
  const rows = rowsFrom("a");
  const registry = computeActiveTemplateRegistry(rows);

  assertTrue(registry.complete, "A: registry should be complete with all 5 real titles present");
  assertTrue(registry.missingKeys.length === 0, "A: no keys should be missing");
  assertTrue(registry.duplicateKeys.length === 0, "A: no keys should be duplicated");

  for (const row of rows) {
    const expectedKey = (Object.entries(ACTIVE_TEMPLATE_TITLES) as [ActiveTemplateKey, string][])
      .find(([, title]) => title === row.title)?.[0];
    assertTrue(
      registry.idToKey.get(row.id) === expectedKey,
      `A: fabricated id for title "${row.title}" should resolve to key "${expectedKey}"`
    );
  }
}

// --- Test B: DIFFERENT simulated UUIDs (a "rebuild") still work ----------
{
  const beforeRebuild = computeActiveTemplateRegistry(rowsFrom("b"));
  const afterRebuild = computeActiveTemplateRegistry(rowsFrom("c")); // completely different ids, same titles

  assertTrue(beforeRebuild.complete, "B: pre-rebuild registry should be complete");
  assertTrue(afterRebuild.complete, "B: post-rebuild registry (different ids) should be complete");

  const beforeIds = new Set(beforeRebuild.idToKey.keys());
  const afterIds = new Set(afterRebuild.idToKey.keys());
  const overlap = [...beforeIds].some((id) => afterIds.has(id));
  assertTrue(
    !overlap,
    "B: before/after id sets should be completely disjoint (proving the ids themselves are irrelevant)"
  );
  assertTrue(
    afterRebuild.idToKey.size === EXPECTED_KEYS.length,
    "B: post-rebuild registry should still recognize all 5 active templates, despite entirely new ids"
  );
}

// --- Missing title -> incomplete, correctly reported ----------------------
{
  const rows = rowsFrom("d").slice(0, 4); // drop one expected title
  const registry = computeActiveTemplateRegistry(rows);
  assertTrue(!registry.complete, "Missing: registry should be incomplete when a title is absent");
  assertTrue(
    registry.missingKeys.length === 1,
    `Missing: exactly one key should be reported missing, got ${registry.missingKeys.length}`
  );
}

// --- Duplicate title -> incomplete, that key excluded from idToKey --------
{
  const rows = rowsFrom("e");
  const duplicated: TemplateTitleRow = { id: fakeId("e-dup"), title: rows[0].title };
  const registry = computeActiveTemplateRegistry([...rows, duplicated]);

  assertTrue(!registry.complete, "Duplicate: registry should be incomplete when a title repeats");
  assertTrue(
    registry.duplicateKeys.length === 1,
    `Duplicate: exactly one key should be reported duplicated, got ${registry.duplicateKeys.length}`
  );
  const duplicatedKey = registry.duplicateKeys[0];
  const stillMapped = [...registry.idToKey.values()].includes(duplicatedKey);
  assertTrue(
    !stillMapped,
    "Duplicate: a duplicated key must never remain resolvable to any id (ambiguous, never guessed)"
  );
}

// --- Unrelated rows are ignored, not errors --------------------------------
{
  const rows = [...rowsFrom("f"), { id: fakeId("unrelated"), title: "Some other template" }];
  const registry = computeActiveTemplateRegistry(rows);
  assertTrue(registry.complete, "Unrelated: an extra, unrelated title should not break resolution");
  assertTrue(
    registry.idToKey.size === EXPECTED_KEYS.length,
    "Unrelated: the unrelated row should not appear in idToKey"
  );
}

console.log(`\n${total - failed}/${total} passed.`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(" - " + f);
}

process.exit(failed === 0 ? 0 : 1);
