/**
 * Tester release (Option A): curated, human-reviewable answer keys for the
 * 5 active-tier platform templates (A2, A5, S4, R5, A4), keyed by the real
 * payload_items.id values already seeded in the database (confirmed via a
 * one-off read-only query against the live catalog on the day this file was
 * written -- not invented, not derived from array position).
 *
 * WHY this file exists: without Anthropic credits, "review" is not a safe
 * terminal state for tester-visible submissions (see TECHNICAL_DEBT/the M5
 * evaluation audit) -- there is no route that can ever resolve it for a
 * platform-owned task. The alternative implemented here is narrower but
 * honest: only certify PASS/FAIL for the specific payload items a human
 * has actually verified an answer for. A payload item with no entry below
 * is, by construction, ineligible for both new task generation
 * (taskTemplatesService.generateTaskInstance filters against this file's
 * curated ID set) and for PASS at evaluation time
 * (testnetDeterministicEvaluator falls closed to FAIL, never PASS, for an
 * uncurated id) -- see requirement #7 in the tester-release spec this file
 * was built against.
 *
 * IMPORTANT CAVEAT, stated plainly rather than buried: the "human review"
 * behind every entry below is my own reading of the actual seed content in
 * scripts/m3-payload-data.ts, cross-checked against the live database rows.
 * It is not a second person's independent sign-off. Items with real
 * category/label ambiguity are marked as such and either given multiple
 * accepted answers or deliberately left OUT of this file entirely (see the
 * "excluded" comments below each template's section) rather than guessed
 * at. A product owner should skim the ambiguous entries before relying on
 * this file for real tester payouts.
 *
 * TEMPLATE-ID RESOLUTION (post-incident fix): task_templates.id is
 * `defaultRandom()` -- every reseed of the database assigns brand-new
 * random UUIDs. An earlier version of this file hardcoded those UUIDs
 * directly, which meant a database rebuild would silently desync this
 * file from reality with no error: every active-tier template would stop
 * being recognized as active and fall through to the legacy, REVIEW-
 * capable evaluator path -- for A4 specifically, that means every
 * submission becomes permanent REVIEW again, the exact defect this whole
 * release exists to close. Below, active-tier identity is resolved at
 * runtime from each template's TITLE (stable across any reseed that
 * re-runs the same seed script) rather than its id, cached briefly, and
 * re-resolved automatically if the cache goes stale. The curated
 * payload-item ground truth above/below is explicitly NOT changed by this
 * fix -- payloadItems.id is also `defaultRandom()` and would have the
 * exact same fragility on a reseed, but re-curating ~100 payload answers
 * by title/content match is a materially bigger, separate piece of work,
 * out of scope here on purpose (the current tester database is not being
 * rebuilt, only template-id resolution needed to survive that scenario
 * today).
 */

/**
 * The 5 active-tier template titles, exactly as authored in
 * scripts/seed-platform-templates-m3.ts -- the one piece of identity that
 * survives a reseed unchanged, since the seed script itself is what's
 * re-run, not hand-edited. This is the new source of truth; everything
 * below resolves the CURRENT database's real ids from these titles, never
 * the reverse.
 */
export const ACTIVE_TEMPLATE_TITLES = {
  A2: "Classify text sentiment",
  A5: "Label the intent of a support message",
  S4: "Classify community message tone",
  R5: "Categorize a blockchain project by type",
  A4: "Identify factual inaccuracies in AI-generated Web3 content",
} as const;

export type ActiveTemplateKey = keyof typeof ACTIVE_TEMPLATE_TITLES;

export interface TemplateTitleRow {
  id: string;
  title: string;
}

interface ActiveTemplateRegistry {
  /** Real database id -> key, only for ids that were positively matched
   * against one of the 5 expected titles with no duplicate/ambiguity. */
  idToKey: ReadonlyMap<string, ActiveTemplateKey>;
  /** True only if all 5 expected titles were found, each exactly once. A
   * false registry is a "degraded" state -- callers must fail closed
   * rather than trust idToKey's absence of a match as proof of anything. */
  complete: boolean;
  missingKeys: readonly ActiveTemplateKey[];
  duplicateKeys: readonly ActiveTemplateKey[];
  resolvedAt: number;
}

/**
 * Pure, synchronous, no I/O -- deliberately factored out of the DB-backed
 * loader below so it can be unit tested directly against fabricated rows
 * with arbitrary/simulated ids (see scripts/verify-active-template-registry.ts),
 * proving this logic keys on TITLE alone and would work identically no
 * matter what the real ids happen to be after any future reseed.
 */
export function computeActiveTemplateRegistry(rows: TemplateTitleRow[]): ActiveTemplateRegistry {
  const titleToKey = new Map<string, ActiveTemplateKey>(
    (Object.entries(ACTIVE_TEMPLATE_TITLES) as [ActiveTemplateKey, string][]).map(
      ([key, title]) => [title, key]
    )
  );

  const idToKey = new Map<string, ActiveTemplateKey>();
  const seenKeys = new Set<ActiveTemplateKey>();
  const duplicateKeys = new Set<ActiveTemplateKey>();

  for (const row of rows) {
    const key = titleToKey.get(row.title);
    if (!key) continue;
    if (seenKeys.has(key)) {
      // Two rows share a title that's supposed to be unique -- never trust
      // either: which one is the "real" active template is now genuinely
      // ambiguous, so both are excluded from idToKey rather than guessing.
      duplicateKeys.add(key);
      idToKey.delete([...idToKey.entries()].find(([, k]) => k === key)?.[0] ?? "");
      continue;
    }
    seenKeys.add(key);
    idToKey.set(row.id, key);
  }

  const missingKeys = (Object.keys(ACTIVE_TEMPLATE_TITLES) as ActiveTemplateKey[]).filter(
    (key) => !seenKeys.has(key) || duplicateKeys.has(key)
  );

  return {
    idToKey,
    complete: missingKeys.length === 0 && duplicateKeys.size === 0,
    missingKeys,
    duplicateKeys: [...duplicateKeys],
    resolvedAt: Date.now(),
  };
}

async function fetchTemplateTitleRows(): Promise<TemplateTitleRow[]> {
  const { db } = await import("@/db");
  const { taskTemplates } = await import("@/db/schema");
  const { inArray } = await import("drizzle-orm");

  return db
    .select({ id: taskTemplates.id, title: taskTemplates.title })
    .from(taskTemplates)
    .where(inArray(taskTemplates.title, Object.values(ACTIVE_TEMPLATE_TITLES)));
}

// Deliberately short: long enough that ordinary request-to-request traffic
// doesn't re-query on every single evaluation/generation/claim call, short
// enough that a database rebuild self-heals within a bounded, disclosed
// window without requiring a redeploy. A rebuild is a rare, operator-driven
// event, not something that happens under live tester traffic -- a brief
// window of degraded (fail-closed) behavior right after one is an accepted,
// disclosed tradeoff, not a silent gap.
const REGISTRY_CACHE_TTL_MS = 60_000;

let cachedRegistry: ActiveTemplateRegistry | null = null;

async function getActiveTemplateRegistry(): Promise<ActiveTemplateRegistry> {
  if (cachedRegistry && Date.now() - cachedRegistry.resolvedAt < REGISTRY_CACHE_TTL_MS) {
    return cachedRegistry;
  }

  try {
    const rows = await fetchTemplateTitleRows();
    const fresh = computeActiveTemplateRegistry(rows);

    if (!fresh.complete) {
      // The safety assertion: fails loudly in server logs rather than
      // silently degrading accuracy. Logged every time the cache refreshes
      // while still incomplete, not once at process start -- there is no
      // reliable single "startup" moment in a serverless Next.js
      // deployment, so this fires on the natural cadence of real traffic
      // instead, which is a stronger guarantee of being noticed, not a
      // weaker one.
      const { log } = await import("@/lib/log");
      log.error("active_template_registry_incomplete", {
        missingKeys: fresh.missingKeys.join(", "),
        duplicateKeys: fresh.duplicateKeys.join(", "),
        resolvedCount: fresh.idToKey.size,
        expectedCount: Object.keys(ACTIVE_TEMPLATE_TITLES).length,
      });
    }

    cachedRegistry = fresh;
    return fresh;
  } catch (err) {
    const { log } = await import("@/lib/log");
    log.error("active_template_registry_resolution_failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    // A last-known-good (even if stale) registry beats treating a transient
    // query failure as "nothing is active." No prior successful resolution
    // at all -- an explicitly incomplete, empty registry, which every
    // caller below is required to treat as a fail-closed signal.
    return (
      cachedRegistry ?? {
        idToKey: new Map(),
        complete: false,
        missingKeys: Object.keys(ACTIVE_TEMPLATE_TITLES) as ActiveTemplateKey[],
        duplicateKeys: [],
        resolvedAt: 0,
      }
    );
  }
}

/** Test-only: forces the next call to re-resolve instead of trusting the
 * cache, so a test can inject a different registry mid-run. */
export function __resetActiveTemplateRegistryCacheForTests(): void {
  cachedRegistry = null;
}

export type ActiveTemplateResolution =
  | { status: "resolved"; key: ActiveTemplateKey }
  | { status: "not_active" }
  | { status: "unresolvable" };

/**
 * The single entry point every other function in this module (and every
 * caller elsewhere in the codebase) goes through to answer "is this
 * templateId one of the 5 active-tier templates, and if so which one."
 * Three-way, not boolean, on purpose: "not_active" (positively confirmed
 * not one of the 5) and "unresolvable" (the registry itself couldn't be
 * trusted right now) require different, sometimes opposite, fail-closed
 * handling in different callers -- collapsing them into one boolean is
 * exactly what silently reintroduces the original UUID-fragility bug.
 */
export async function resolveActiveTemplate(
  templateId: string | null
): Promise<ActiveTemplateResolution> {
  if (!templateId) return { status: "not_active" };

  const registry = await getActiveTemplateRegistry();
  if (!registry.complete) {
    return { status: "unresolvable" };
  }

  const key = registry.idToKey.get(templateId);
  return key ? { status: "resolved", key } : { status: "not_active" };
}

/**
 * Convenience boolean wrapper. Fails closed toward TRUE on "unresolvable"
 * -- when the registry can't be trusted, every caller of this function
 * (evaluation, automatic-payout gating, claim eligibility, UI display) is
 * biased toward treating the task as active-tier rather than risking a
 * silent fall-through to the legacy REVIEW-capable path. The strict
 * active-tier evaluator itself already fails closed to FAIL (never a wrong
 * PASS) when it can't find curated ground truth, so erring toward "treat
 * as active" is the safe direction here, never the dangerous one.
 */
export async function isActiveTierTemplate(templateId: string | null): Promise<boolean> {
  const resolution = await resolveActiveTemplate(templateId);
  return resolution.status !== "not_active";
}

/**
 * Standalone health-check primitive (tester-release requirement: "detect
 * missing active template, duplicate active template titles/keys,
 * mismatch between expected active set and database... fail loudly in
 * server logs"). Not wired into any existing route by this change -- the
 * registry already logs loudly on every real resolution attempt (see
 * getActiveTemplateRegistry above), which covers ordinary traffic; this
 * export exists so an operator-facing health endpoint (e.g. the existing
 * app/api/operator/treasury/health route, deliberately left untouched
 * here to keep that unrelated pre-existing work separate) can surface the
 * same signal on demand, whenever that's wired up.
 */
export async function assertActiveTemplateRegistryHealthy(): Promise<{
  healthy: boolean;
  missingKeys: readonly ActiveTemplateKey[];
  duplicateKeys: readonly ActiveTemplateKey[];
  resolvedCount: number;
  expectedCount: number;
}> {
  cachedRegistry = null; // health checks must never report a stale cache as current
  const registry = await getActiveTemplateRegistry();
  return {
    healthy: registry.complete,
    missingKeys: registry.missingKeys,
    duplicateKeys: registry.duplicateKeys,
    resolvedCount: registry.idToKey.size,
    expectedCount: Object.keys(ACTIVE_TEMPLATE_TITLES).length,
  };
}

// ---------------------------------------------------------------------------
// Classification templates (A2, A5, S4, R5): one or more accepted label
// strings per payload item, matched case-insensitively against whichever
// single label the deterministic evaluator's existing
// evaluateSingleLabelClassification already extracts from the submission.
// Multiple accepted labels are used ONLY where the underlying real-world
// classification is genuinely defensible more than one way -- never as a
// substitute for actually having verified the content.
// ---------------------------------------------------------------------------

export interface ClassificationGroundTruth {
  acceptedLabels: readonly string[];
  note?: string;
}

/**
 * A2 -- Classify text sentiment. 20 payload items seeded; 14 curated
 * (7 clearly positive, 7 clearly negative). The remaining 6 are
 * deliberately EXCLUDED: they read as neutral/mixed/factual statements
 * (e.g. "took about ten minutes start to finish", "still figuring out how
 * it compares") where a reasonable person could defend "neutral" or a mild
 * positive/negative lean -- not curated, not eligible for tester
 * assignment until a human explicitly adjudicates them.
 *
 * Excluded ids (neutral/ambiguous, not in this map on purpose):
 * 6b5c54f5-04fb-4248-a9b4-ae511303e310, 6853fc13-a7d7-41b6-bcaf-de320a7da018,
 * d7521597-7aeb-43fd-881b-8b952e3fb7b6, 7e855d0d-c34d-4449-b70b-d02f5da50ed7,
 * 36f3c1ec-8742-4105-b979-790c0ee34578, 57db7591-fadb-43e0-b9c5-fdecbf7674ab
 */
export const A2_GROUND_TRUTH: Record<string, ClassificationGroundTruth> = {
  "19d815bb-3590-47f3-ad57-30534ba514c4": { acceptedLabels: ["positive"] },
  "84af07a3-e4cd-4a5d-930d-c20310a39e4f": { acceptedLabels: ["positive"] },
  "ec6e7bf2-29d1-414c-8501-20f2ba864765": { acceptedLabels: ["negative"] },
  "3a92f626-3860-4857-a3fe-6ae75d3f502c": { acceptedLabels: ["negative"] },
  "fa35fb3b-a039-4100-9b7e-1878d2e3b9ff": { acceptedLabels: ["negative"] },
  "505f96a1-e0e2-46ac-9526-12331e1ba294": { acceptedLabels: ["negative"] },
  "c8940d75-434d-40e1-bf17-ce1887ae801c": { acceptedLabels: ["negative"] },
  "f55ff925-098f-4f7c-8909-1a4345fd4301": { acceptedLabels: ["negative"] },
  "99c47021-5924-453d-aa4c-11fc401ccb00": { acceptedLabels: ["negative"] },
  "5d110926-5113-478f-a043-75e2593eb515": { acceptedLabels: ["positive"] },
  "f0b49c35-7398-4c68-b562-2d7519932695": { acceptedLabels: ["positive"] },
  "f346ebba-2c97-4013-9140-5b7653ad1aa9": { acceptedLabels: ["positive"] },
  "926add7a-ab8d-4e01-a53e-844b823db61a": { acceptedLabels: ["positive"] },
  "6a7b1cf4-aa84-4e7b-8913-36f0104449a6": { acceptedLabels: ["positive"] },
};

/**
 * A5 -- Label the intent of a support message. 20 seeded; 19 curated.
 * Excluded: 58197cfe-14e4-47c2-9f0d-8b649766ffea ("third time this month
 * the platform has been down during peak trading hours") -- genuinely
 * reads as either a Technical Bug report or a Complaint about reliability;
 * left uncurated rather than picked.
 */
export const A5_GROUND_TRUTH: Record<string, ClassificationGroundTruth> = {
  "620a47a5-ec50-4792-a0b2-09d7f71e0da3": { acceptedLabels: ["how-to question"] },
  "0d353144-d8d9-4c6f-84cd-25fe5ff9b160": { acceptedLabels: ["billing issue"] },
  "58ab2a7d-16e0-4d30-883b-99f06cf8104a": { acceptedLabels: ["technical bug"] },
  "9b7ba792-85dc-4893-8243-636bc742a19f": { acceptedLabels: ["technical bug"] },
  "286c4a16-325e-4e77-bd5e-5f29da7ee7d8": { acceptedLabels: ["technical bug"] },
  "1a51c6fe-068d-435a-a052-0e2602560c8d": { acceptedLabels: ["technical bug"] },
  "ddfff269-511b-4d6e-9b61-25e20f95070f": { acceptedLabels: ["how-to question"] },
  "05a7d520-b885-4993-aa7c-ef8843294c7c": { acceptedLabels: ["billing issue"] },
  "8dbd9b7d-98c7-450c-a304-412f0c4cf1f2": { acceptedLabels: ["billing issue"] },
  "21307feb-19d1-4dea-abf7-7b069c2efac8": { acceptedLabels: ["billing issue"] },
  "a801a040-a523-4992-9f2b-844430bd8b9e": { acceptedLabels: ["how-to question"] },
  "41bc32f4-8975-465f-8009-eae4eac009ce": { acceptedLabels: ["complaint"] },
  "e1b8847d-0b7d-44d4-be67-ebf75053c136": { acceptedLabels: ["complaint"] },
  "c500fd9d-8d80-4aaa-93f4-e5138b1fd045": { acceptedLabels: ["complaint"] },
  "77fea924-28ec-408f-90a2-b2c68d798218": { acceptedLabels: ["feature request"] },
  "210ac2e9-f750-479f-a398-690ffcb3348d": { acceptedLabels: ["feature request"] },
  "8c63705e-c947-4684-a0a3-d16656ac0f59": { acceptedLabels: ["feature request"] },
  "b1220bc9-0d26-4fc4-ba95-431be47ad063": { acceptedLabels: ["feature request"] },
  "7596d79f-a0db-4019-8d5f-11bf4845934c": { acceptedLabels: ["how-to question"] },
};

/**
 * S4 -- Classify community message tone. 20 seeded, all 20 curated -- the
 * seed data itself is authored in clean blocks of 4 per label with no
 * genuine cross-label ambiguity found on review.
 */
export const S4_GROUND_TRUTH: Record<string, ClassificationGroundTruth> = {
  "6621c971-c98f-4a7b-9ca9-2856de6122c5": { acceptedLabels: ["hostile"] },
  "d40c3051-39a0-47ba-ad4d-08ab8f6c35d7": { acceptedLabels: ["hostile"] },
  "a9856313-e592-4931-9cb3-9ff1a9d15edd": { acceptedLabels: ["hostile"] },
  "15f0ae38-c5ca-4030-bea3-91dda984732d": { acceptedLabels: ["hostile"] },
  "ba445318-bece-4685-9c06-d60b5659bdf2": { acceptedLabels: ["confused"] },
  "68aba965-d8a6-499b-abed-3abf89b04601": { acceptedLabels: ["confused"] },
  "202ebf11-312f-4b02-94b4-5e4076658761": { acceptedLabels: ["confused"] },
  "7b817a04-bf73-4f93-ba25-b757dfa36ef1": { acceptedLabels: ["confused"] },
  "c8a6065a-05f2-44b3-afb0-ad9b241cd53d": { acceptedLabels: ["excited"] },
  "489f9da0-d8cc-4fa5-b1cd-d3e081106601": { acceptedLabels: ["excited"] },
  "827213dd-804a-4170-9ef8-5a54dbe9776e": { acceptedLabels: ["excited"] },
  "4dde759e-5296-4eb2-a964-45abdf9ed4e2": { acceptedLabels: ["excited"] },
  "79a644ce-81f0-46fc-b74f-26c308ae50fa": { acceptedLabels: ["neutral"] },
  "c9a81066-54cb-4272-81a7-ee528064216c": { acceptedLabels: ["neutral"] },
  "498b39ba-aaab-4d01-af83-23d551d6e29e": { acceptedLabels: ["neutral"] },
  "1c917659-0737-4624-beb2-8813bc4de809": { acceptedLabels: ["neutral"] },
  "1817c40f-663a-4be7-a29e-4690245e26f7": { acceptedLabels: ["constructive"] },
  "b802b08d-bf97-4351-a2d1-dcc3299f4234": { acceptedLabels: ["constructive"] },
  "931f05d5-ba96-4330-918e-fe83bab310cc": { acceptedLabels: ["constructive"] },
  "072fc323-ea9c-4d8a-aaec-571189134e56": { acceptedLabels: ["constructive"] },
};

/**
 * R5 -- Categorize a blockchain project by type. 20 seeded; 20 curated,
 * but 3 are given MULTIPLE accepted labels because the real-world
 * classification is genuinely defensible more than one way given the
 * payload's own description text -- these are noted individually, not
 * guessed at as a single "best" answer.
 */
export const R5_GROUND_TRUTH: Record<string, ClassificationGroundTruth> = {
  "2ef15685-3777-4439-900c-026724f9aa1d": { acceptedLabels: ["infrastructure"] }, // The Graph
  "c14fa967-5c35-4636-88ba-0255f39d9674": { acceptedLabels: ["infrastructure"] }, // Filecoin
  "cfe96966-7a94-4963-a610-e46cf29c128f": { acceptedLabels: ["identity"] }, // Worldcoin
  "14c922bc-e240-4de4-be22-ff3d4c46c6d5": {
    acceptedLabels: ["defi", "dao tooling"],
    note:
      "MakerDAO: product is a DeFi stablecoin protocol, but the payload's own " +
      "description frames it as \"a decentralized organization that governs... " +
      "through community voting\" -- governance-first phrasing makes DAO Tooling " +
      "an equally defensible reading of the given text.",
  },
  "9542d8f4-4211-4311-9346-235abd141267": {
    acceptedLabels: ["infrastructure", "dao tooling"],
    note:
      "Safe: a wallet (Infrastructure) whose stated purpose is letting " +
      "\"multiple people jointly control shared crypto funds\" -- exactly the " +
      "shared-fund-control use case DAO Tooling also covers.",
  },
  "00835c8f-8ce6-41f4-a02d-2d385eeb234b": {
    acceptedLabels: ["infrastructure", "identity"],
    note:
      "ENS: a naming system mapping human-readable names to addresses -- " +
      "reasonably read as core network Infrastructure or as an Identity system.",
  },
  "a896d82c-cf62-4f6b-9ae1-528f2eb68d2e": { acceptedLabels: ["defi"] }, // Uniswap
  "07ff11f3-d1fa-4ce4-a073-01acd571ce04": { acceptedLabels: ["defi"] }, // Aave
  "0885e279-0510-430d-bbcd-1dea97f3c58a": { acceptedLabels: ["nft/gaming"] }, // Axie Infinity
  "50492b8b-53d4-454a-a1b5-f640ebad625e": { acceptedLabels: ["nft/gaming"] }, // OpenSea
  "c47ece77-5440-4910-82d5-b77b28bd7397": { acceptedLabels: ["defi"] }, // Curve Finance
  "c20e9c1d-cbd7-4e81-8583-666a4b9dd764": { acceptedLabels: ["defi"] }, // Compound
  "40690bda-99cd-4a95-8c1c-3c6083667830": { acceptedLabels: ["nft/gaming"] }, // Decentraland
  "98f9601e-de73-4fdf-9510-eeb45a78d6dd": { acceptedLabels: ["nft/gaming"] }, // The Sandbox
  "b3564c6e-bd32-42ca-ac90-922dd74d178e": { acceptedLabels: ["infrastructure"] }, // Arweave
  "868ee81b-c0c7-48e5-9580-a36362d10f3c": { acceptedLabels: ["infrastructure"] }, // Chainlink
  "e599d260-7827-4d2f-b60f-c2f1fb26cc74": { acceptedLabels: ["dao tooling"] }, // Optimism Collective
  "919f5690-4470-4a66-8919-0a4d1e69ebd8": { acceptedLabels: ["dao tooling"] }, // Arbitrum DAO
  "98af0828-ae71-45b1-8d60-199f23140301": { acceptedLabels: ["identity"] }, // Lens Protocol
  "bec5c89a-4c0b-48e1-90e2-fac95d47ef89": { acceptedLabels: ["identity"] }, // Farcaster
};

// ---------------------------------------------------------------------------
// A4 -- Identify factual inaccuracies in AI-generated Web3 content.
//
// The seed file (scripts/m3-payload-data.ts) states outright that 10 of the
// 20 paragraphs are factually clean and 10 contain one deliberately planted,
// plausible-sounding inaccuracy, with the answer recorded nowhere. Reading
// all 20 paragraphs against real, verifiable Web3 facts resolves this
// completely and unambiguously -- every "flawed" paragraph contradicts
// either its own clean twin or well-established mechanics (e.g. claiming
// proof-of-stake validators "compete by solving cryptographic puzzles",
// which is proof-of-work behavior). All 20 items are curated; there is no
// excluded/ambiguous set for this template.
// ---------------------------------------------------------------------------

export type A4Status = "clean" | "flawed";

export interface A4GroundTruth {
  status: A4Status;
  /**
   * Only present for status: "flawed". Distinctive terms/phrases from the
   * SPECIFIC planted error -- used to check that a worker who claims to
   * have found an error actually named this one, not just guessed "yes,
   * there's an error somewhere." Matched case-insensitively as a substring
   * against the worker's own submission text; any one match is sufficient.
   */
  errorTerms?: readonly string[];
}

// ---------------------------------------------------------------------------
// Generation-time gate. Used by taskTemplatesService.generateTaskInstance
// so an active-tier template's NEW instances only ever claim a payload item
// that has actually been human-reviewed -- an ambiguous/unreviewed item
// (e.g. any of A2's excluded neutral-bucket ids) can never be assigned to a
// tester in the first place, not merely fail evaluation after the fact.
// ---------------------------------------------------------------------------

/**
 * Returns the curated, eligible-for-assignment payload item ids for an
 * active-tier template, null if templateId is positively confirmed NOT one
 * of the 5 active-tier templates (no restriction applies -- unchanged
 * behavior for every other template, active or paused), or an EMPTY set if
 * the registry itself is currently unresolvable. Empty, not null, in that
 * last case on purpose: null means "no restriction, use any available
 * item," which would be unsafe to return when we can't even confirm which
 * templates are active-tier right now -- an empty set instead makes
 * generateTaskInstance's candidate query match nothing, so a degraded
 * registry blocks new assignment rather than ever risking an uncurated one.
 */
export async function getCuratedPayloadItemIds(
  templateId: string
): Promise<ReadonlySet<string> | null> {
  const resolution = await resolveActiveTemplate(templateId);

  if (resolution.status === "not_active") return null;
  if (resolution.status === "unresolvable") return new Set();

  switch (resolution.key) {
    case "A2":
      return new Set(Object.keys(A2_GROUND_TRUTH));
    case "A5":
      return new Set(Object.keys(A5_GROUND_TRUTH));
    case "S4":
      return new Set(Object.keys(S4_GROUND_TRUTH));
    case "R5":
      return new Set(Object.keys(R5_GROUND_TRUTH));
    case "A4":
      return new Set(Object.keys(A4_GROUND_TRUTH));
  }
}

export const A4_GROUND_TRUTH: Record<string, A4GroundTruth> = {
  "9d31a120-dc48-47e4-b982-84ae2339ba97": { status: "clean" }, // The Merge, accurate
  "74af5109-488d-4fa7-bcb0-5f19a4ca050e": {
    status: "flawed",
    errorTerms: ["no new token", "same token", "no risk", "peg"],
  }, // bridge: falsely claims no wrapped token is minted / no peg risk
  "87f683e7-94ba-4a27-bdf5-f0a52a909c67": { status: "clean" }, // impermanent loss, accurate
  "ca558aa5-8aac-47a1-b294-f2532e0baac2": {
    status: "flawed",
    errorTerms: ["permanent", "cannot be recovered", "never applied", "kept separately"],
  }, // impermanent loss: falsely claims it's permanent/unrecoverable
  "d45adf65-db57-49b3-b688-04e343b65322": { status: "clean" }, // oracles, accurate
  "ccaff0be-12f9-41ab-9357-f6b03522c0f5": {
    status: "flawed",
    errorTerms: ["optional", "entertainment", "never require", "immune"],
  }, // oracles: falsely claims DeFi never needs external price data
  "f9a8634b-51cf-45a6-a2f3-5643092596b9": {
    status: "flawed",
    errorTerms: ["ten times", "10x", "puzzles", "throughput"],
  }, // PoS: falsely claims a 10x throughput jump and PoW-style puzzle-solving
  "d01de21e-b34a-40e8-aedd-e65c1d723aaa": { status: "clean" }, // hardware wallet, accurate
  "29aaef8b-5232-4634-8852-f9be387b35d1": {
    status: "flawed",
    errorTerms: ["no backup", "no recovery", "permanently inaccessible"],
  }, // hardware wallet: falsely claims no seed-phrase recovery exists
  "3c20c5b8-5046-495a-a0b8-2f2bf40d9693": { status: "clean" }, // token bridge, accurate
  "87403282-35ac-4069-b1cc-4698cff91c64": { status: "clean" }, // MEV, accurate
  "1f598b63-aa03-49bd-a7f5-d1980872f1c4": {
    status: "flawed",
    errorTerms: ["only", "proof-of-work", "immune", "mining hardware"],
  }, // MEV: falsely claims it only exists on PoW / PoS is immune
  "ab63b118-7c96-475a-b408-914ffcb5e3a2": { status: "clean" }, // account abstraction, accurate
  "96a98fbd-1310-4f1c-b801-75afcc2b1fe9": {
    status: "flawed",
    errorTerms: ["username", "password", "eliminates", "cannot be drained"],
  }, // account abstraction: falsely claims private keys are eliminated entirely
  "06797f4c-faaa-403f-8274-205d38a7d39f": { status: "clean" }, // NFT, accurate
  "3611b59a-0edf-4215-9c00-8cc8c313857f": {
    status: "flawed",
    errorTerms: ["always stores", "complete", "no exceptions", "unnecessary"],
  }, // NFT: falsely claims the full file is always stored on-chain
  "fdf76e91-cc1e-48d7-9d13-b9d05561e023": { status: "clean" }, // DAO, accurate
  "9a25e61d-1ae7-415f-8fb1-8a66f0896d36": {
    status: "flawed",
    errorTerms: ["legal entity", "every country", "no jurisdictional", "universal"],
  }, // DAO: falsely claims universal legal recognition worldwide
  "7be6e5c2-a1e7-4147-8f91-481b1ee92c45": { status: "clean" }, // rollup, accurate
  "8fa2e868-20d6-4608-8776-0c72368c775a": {
    status: "flawed",
    errorTerms: ["independently", "no data", "never posted", "same security"],
  }, // rollup: falsely claims it never posts data back to the main chain
};
