import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  applications,
  payloadItems,
  payloadSources,
  submissions,
  taskTemplates,
  tasks,
} from "@/db/schema";
import { log } from "@/lib/log";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Phase 11C (payload-based tasks): the approved application-level content
 * bound for a single payload item. Deliberately not a database CHECK
 * constraint -- migration 0010 is already applied and closed; a length
 * bound is exactly the kind of rule that belongs in the service layer, the
 * same posture ALLOWED_CATEGORIES/MIN_REWARD_USDC/MAX_REWARD_USDC already
 * take in taskTemplatesService.ts.
 */
export const MAX_PAYLOAD_ITEM_CONTENT_LENGTH = 2000;

export class TemplateNotFoundError extends Error {}
export class PayloadSourceNotFoundError extends Error {}
export class InvalidPayloadItemError extends Error {}

export interface CreatePayloadSourceInput {
  templateId: string;
  label?: string;
  // Phase 11C, AI-Assisted Supply: optional, defaults to 'manual' via the
  // schema exactly as before -- every existing caller (Step 2's own
  // callers, the Step 2/3/4 verification suites) that never passed this
  // field keeps getting a 'manual' source, byte-for-byte the same
  // behavior as before this parameter existed. 'ai_generated' is the only
  // other value the schema currently defines (migration 0011).
  kind?: "manual" | "ai_generated";
}

/**
 * Creates a payload source for an existing template. status is
 * deliberately left unset here, taking its schema default ('active') --
 * the same posture createPlatformTemplate already takes for
 * task_templates' own status/pool columns. kind defaults to 'manual' the
 * same way (via the schema) when the caller doesn't pass one.
 *
 * No public route calls this. It exists purely as an internal/operator
 * primitive, the same trust boundary as everything else in this file:
 * payload content is opaque, operator-or-AI-authored text, never fetched,
 * never parsed, never exposed through any public ingestion path.
 */
export async function createPayloadSource(input: CreatePayloadSourceInput) {
  if (!UUID_RE.test(input.templateId)) {
    throw new TemplateNotFoundError(
      `No task template with id "${input.templateId}" exists.`
    );
  }

  const [template] = await db
    .select({ id: taskTemplates.id })
    .from(taskTemplates)
    .where(eq(taskTemplates.id, input.templateId))
    .limit(1);

  if (!template) {
    throw new TemplateNotFoundError(
      `No task template with id "${input.templateId}" exists.`
    );
  }

  const label = input.label?.trim();

  const [source] = await db
    .insert(payloadSources)
    .values({
      templateId: template.id,
      label: label ? label : null,
      ...(input.kind ? { kind: input.kind } : {}),
    })
    .returning();

  return source;
}

/**
 * Adds one or more payload items to an existing source. templateId is
 * always taken from the source row, never from the caller -- an item can
 * never be attached to a different template than the source that owns it.
 *
 * Every content string in the batch is validated (non-empty, within
 * MAX_PAYLOAD_ITEM_CONTENT_LENGTH) BEFORE any row is inserted, so an
 * oversized item anywhere in the batch rejects the whole call rather than
 * partially inserting. Content is stored exactly as supplied -- no
 * trimming, no normalization, no deduplication -- because it is opaque to
 * this layer; trimming would silently mutate operator-supplied data this
 * function has no basis to judge as insignificant whitespace.
 *
 * Content is never fetched, parsed, or interpreted here, even when it
 * looks like a URL -- there is no content-type discriminator in this
 * schema, and there must never be a server-side fetch of anything stored
 * in this column.
 */
export async function addPayloadItems(sourceId: string, contents: string[]) {
  if (!UUID_RE.test(sourceId)) {
    throw new PayloadSourceNotFoundError(
      `No payload source with id "${sourceId}" exists.`
    );
  }

  if (contents.length === 0) {
    throw new InvalidPayloadItemError("At least one item is required.");
  }

  for (const content of contents) {
    if (content.length === 0) {
      throw new InvalidPayloadItemError("Payload item content must not be empty.");
    }
    if (content.length > MAX_PAYLOAD_ITEM_CONTENT_LENGTH) {
      throw new InvalidPayloadItemError(
        `Payload item content exceeds the ${MAX_PAYLOAD_ITEM_CONTENT_LENGTH}-character ` +
          `limit (got ${content.length}).`
      );
    }
  }

  const [source] = await db
    .select({ id: payloadSources.id, templateId: payloadSources.templateId })
    .from(payloadSources)
    .where(eq(payloadSources.id, sourceId))
    .limit(1);

  if (!source) {
    throw new PayloadSourceNotFoundError(
      `No payload source with id "${sourceId}" exists.`
    );
  }

  const rows = await db
    .insert(payloadItems)
    .values(
      contents.map((content) => ({
        sourceId: source.id,
        templateId: source.templateId,
        content,
      }))
    )
    .returning();

  return rows;
}

/**
 * Pauses a source: future payload claims (Step 3, not yet built) must
 * skip it. This touches ONLY payload_sources.status -- never
 * payload_items, never tasks, never any pool. Existing available items
 * stay available; existing assigned items stay assigned. "Exhausted" and
 * "paused" are different, deliberately-uncombined facts: this function
 * does not look at, and must never look at, how many items remain.
 */
export async function pausePayloadSource(sourceId: string) {
  if (!UUID_RE.test(sourceId)) {
    throw new PayloadSourceNotFoundError(
      `No payload source with id "${sourceId}" exists.`
    );
  }

  const [updated] = await db
    .update(payloadSources)
    .set({ status: "paused", updatedAt: new Date() })
    .where(eq(payloadSources.id, sourceId))
    .returning();

  if (!updated) {
    throw new PayloadSourceNotFoundError(
      `No payload source with id "${sourceId}" exists.`
    );
  }

  return updated;
}

/**
 * Activates a source: its still-available items become eligible for
 * future claims again (Step 3, not yet built). Mirrors pausePayloadSource
 * exactly -- only payload_sources.status changes. Items were never
 * touched by pausing, so there is nothing for this function to restore on
 * them either.
 */
export async function activatePayloadSource(sourceId: string) {
  if (!UUID_RE.test(sourceId)) {
    throw new PayloadSourceNotFoundError(
      `No payload source with id "${sourceId}" exists.`
    );
  }

  const [updated] = await db
    .update(payloadSources)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(payloadSources.id, sourceId))
    .returning();

  if (!updated) {
    throw new PayloadSourceNotFoundError(
      `No payload source with id "${sourceId}" exists.`
    );
  }

  return updated;
}

/**
 * Phase 11C, Step 4: releases a cancelled task's claimed payload item back
 * to 'available' -- but ONLY when no submission was ever recorded against
 * it. Once real work has been submitted, the claim is permanent history,
 * never released -- mirrors tasks.payloadItemId's own schema doc comment
 * ("write-once... never revisited afterward, including on cancellation").
 *
 * A plain no-op (returns false), never an error, for every case that
 * doesn't apply: a self_contained task (payloadItemId is null), a task
 * whose item was already released or reassigned by something else (status
 * isn't 'assigned' anymore), or a task with a submission on record.
 *
 * Does not touch cancelTask, applications, submissions, or the tasks row
 * itself -- purely a payload_items status transition, meant to be called
 * by the cancel route AFTER cancelTask has already committed, the exact
 * same best-effort-after-success shape that route's own
 * replenishTemplateIfNeeded call already uses.
 *
 * The submission check and the release UPDATE are two separate
 * statements, not one transaction -- an accepted, narrow, ordinary
 * read-committed race (a submission recorded in the instant between them
 * would let this release anyway), the same class of residual this
 * codebase already documents elsewhere rather than closing with a lock,
 * appropriate here because this call is itself best-effort, never the
 * source of truth for payout eligibility.
 */
export async function releasePayloadItemForCancelledTask(
  taskId: string
): Promise<boolean> {
  if (!UUID_RE.test(taskId)) {
    return false;
  }

  const [task] = await db
    .select({ payloadItemId: tasks.payloadItemId })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  if (!task?.payloadItemId) {
    return false;
  }

  const [hasSubmission] = await db
    .select({ id: submissions.id })
    .from(submissions)
    .innerJoin(applications, eq(submissions.applicationId, applications.id))
    .where(eq(applications.taskId, taskId))
    .limit(1);

  if (hasSubmission) {
    return false;
  }

  const [released] = await db
    .update(payloadItems)
    .set({ status: "available", updatedAt: new Date() })
    .where(
      and(eq(payloadItems.id, task.payloadItemId), eq(payloadItems.status, "assigned"))
    )
    .returning({ id: payloadItems.id });

  return Boolean(released);
}

// ---------------------------------------------------------------------------
// Supply-chain: automatic payload replenishment. No public route calls this
// yet -- it exists purely as an internal primitive, triggered best-effort by
// replenishTemplateIfNeeded (taskTemplatesService.ts) at the exact point
// generateTaskInstance already reports payload_exhausted.
// ---------------------------------------------------------------------------

/**
 * Trigger point: replenishPayloadSupplyIfNeeded is only ever called once a
 * template has already hit payload_exhausted, so "available" is already
 * effectively zero at that moment -- this constant exists for clarity, and
 * for any future proactive (non-exhaustion-triggered) caller, not because
 * the current single call site needs a nonzero threshold to do anything.
 */
export const PAYLOAD_LOW_WATER_MARK = 5;

/**
 * Matches DEFAULT_TARGET_AVAILABLE (taskTemplatesService.ts) -- top up
 * toward the same steady-state figure task-instance replenishment already
 * targets, not a separately-invented number.
 */
export const PAYLOAD_REPLENISH_TARGET = 20;

/**
 * Hard ceiling, independent of the target above -- a defensive backstop
 * against ever growing a source's available-item count unboundedly, even
 * under a bug or an unexpected future caller. Never expected to bind in
 * normal operation: it only matters if availableBefore is somehow already
 * above PAYLOAD_REPLENISH_TARGET when this runs, which the exhaustion-only
 * trigger point in use today never produces.
 */
export const PAYLOAD_MAX_AVAILABLE = 50;

// Small and bounded on purpose -- if the AI provider is down or out of
// credit, the first attempt's failure will not be fixed by trying again
// immediately, so batching stops after the first failed batch rather than
// retrying it. This only bounds how many *batches* one replenishment
// attempt makes (each ≤10 items, generatePayloadContent's own limit), not
// automatic retries of a failed batch.
const MAX_BATCH_ATTEMPTS = 3;

/**
 * Tester release, no-Anthropic-credits period: the single, obvious switch
 * for whether replenishPayloadSupplyIfNeeded is allowed to call the
 * Anthropic-backed generatePayloadContent at all. Flip to true to restore
 * the original automatic-replenishment behavior once Anthropic credits are
 * available again -- nothing else about this file changes either way.
 * Deliberately a plain, greppable, top-level constant rather than an env
 * var: an env var could differ between local/preview/production without
 * anyone noticing, which is exactly wrong for a switch whose entire
 * purpose is "never call Anthropic unexpectedly." Existing seeded payload
 * items (payload_items rows already in the database) are completely
 * unaffected either way -- this only gates whether NEW items get
 * AI-generated once a source runs low.
 */
export const AI_PAYLOAD_REPLENISHMENT_ENABLED = false;

export type PayloadReplenishOutcome =
  | "sufficient"
  | "at_ceiling"
  | "no_active_source"
  | "provider_unavailable"
  | "ai_replenishment_disabled"
  | "no_new_content"
  | "replenished";

export interface PayloadReplenishResult {
  outcome: PayloadReplenishOutcome;
  added: number;
  availableAfter: number;
  reason?: string;
}

function normalizeForDedup(content: string): string {
  return content.trim().toLowerCase();
}

async function countAvailable(sourceId: string): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(payloadItems)
    .where(and(eq(payloadItems.sourceId, sourceId), eq(payloadItems.status, "available")));
  return n;
}

/**
 * Batches generatePayloadContent calls up to `needed` items, ≤10
 * (generatePayloadContent's own MAX_BATCH_SIZE) per call. Stops immediately
 * on the first failed batch rather than retrying -- a provider outage or
 * credit exhaustion (the known current testnet state) will not resolve
 * itself between consecutive calls a few hundred milliseconds apart, so
 * retrying would only add latency without changing the outcome. Whatever
 * was collected before a failure is kept, never discarded -- a partial
 * batch is a usable result, not a failure.
 *
 * lib/ai/generatePayloadContent.ts (and the lib/ai/client.ts it imports) is
 * deliberately reached only via a dynamic import here, the same lazy-import
 * pattern this codebase already uses for lib/circle/* -- lib/ai/client.ts
 * throws at module-load time if ANTHROPIC_API_KEY is unset, and a static
 * import here would make this entire service module (imported throughout
 * the payload/task-generation path) unimportable in any environment without
 * Anthropic configured. This is the mechanism that makes "fail safely if
 * the AI provider is unavailable" actually true rather than aspirational.
 */
async function generateBatchedPayloadContent(
  templateContext: {
    title: string;
    description: string;
    category: string;
    difficulty: string;
  },
  needed: number
): Promise<{ items: string[]; error?: unknown }> {
  const { generatePayloadContent } = await import("@/lib/ai/generatePayloadContent");

  const collected: string[] = [];
  let attempts = 0;
  let error: unknown;

  while (collected.length < needed && attempts < MAX_BATCH_ATTEMPTS) {
    attempts++;
    const batchSize = Math.min(10, needed - collected.length);
    try {
      const batch = await generatePayloadContent(templateContext, { count: batchSize });
      collected.push(...batch);
    } catch (err) {
      error = err;
      break;
    }
  }

  return { items: collected, error: collected.length === 0 ? error : undefined };
}

/**
 * Best-effort: tops up a template's payload supply once it runs low, using
 * the existing generatePayloadContent primitive. Never throws -- every
 * failure mode (no active source, AI provider unavailable, nothing new
 * after dedup) is a typed outcome the caller can log, not an exception that
 * could turn a caller's own best-effort step into a hard failure. This
 * mirrors replenishTemplateIfNeeded's own posture toward the routes that
 * call it: a supply-side problem here must never surface as a 500 on an
 * approve/cancel request that has nothing to do with payload content.
 *
 * The AI call itself runs with no database transaction open, matching this
 * codebase's existing convention (reserveTemplatePool, submitCirclePayoutTransfer)
 * of never holding a lock across network I/O. The accepted residual: two
 * concurrent callers can both observe low supply and both call the AI
 * provider, wasting one redundant call -- documented here rather than
 * closed with heavier machinery, the same class of accepted, explained
 * residual TECHNICAL_DEBT.md already carries for cancel-vs-retry and
 * cancel-vs-approve. What is NOT accepted, and IS fully closed: duplicate
 * payload_items rows. The final count-check-and-insert happens inside one
 * db.transaction with the source row locked via FOR UPDATE, so whichever
 * concurrent attempt commits first is the one whose items actually land --
 * the second re-reads fresh state, re-dedupes against it, and re-checks
 * remaining headroom under the same ceiling before inserting anything.
 */
export async function replenishPayloadSupplyIfNeeded(
  templateId: string
): Promise<PayloadReplenishResult> {
  if (!UUID_RE.test(templateId)) {
    return { outcome: "no_active_source", added: 0, availableAfter: 0 };
  }

  const [source] = await db
    .select()
    .from(payloadSources)
    .where(and(eq(payloadSources.templateId, templateId), eq(payloadSources.status, "active")))
    .orderBy(asc(payloadSources.createdAt))
    .limit(1);

  if (!source) {
    return { outcome: "no_active_source", added: 0, availableAfter: 0 };
  }

  const availableBefore = await countAvailable(source.id);
  if (availableBefore >= PAYLOAD_LOW_WATER_MARK) {
    return { outcome: "sufficient", added: 0, availableAfter: availableBefore };
  }

  const needed = Math.min(
    PAYLOAD_REPLENISH_TARGET - availableBefore,
    PAYLOAD_MAX_AVAILABLE - availableBefore
  );
  if (needed <= 0) {
    return { outcome: "at_ceiling", added: 0, availableAfter: availableBefore };
  }

  if (!AI_PAYLOAD_REPLENISHMENT_ENABLED) {
    // No-Anthropic-credits tester period: fails safe. A template simply
    // stops generating new instances once its curated/seeded payload runs
    // out ("sold out"), the same ordinary "insufficient_capacity"-shaped
    // outcome generateTaskInstance already handles for a pool-exhausted
    // template -- never an unexpected Anthropic call, never a failed
    // request for whatever best-effort caller triggered this.
    log.info("payload_replenishment_skipped_ai_disabled", {
      templateId,
      availableBefore,
    });
    return {
      outcome: "ai_replenishment_disabled",
      added: 0,
      availableAfter: availableBefore,
    };
  }

  const [template] = await db
    .select({
      title: taskTemplates.title,
      description: taskTemplates.description,
      category: taskTemplates.category,
      difficulty: taskTemplates.difficulty,
    })
    .from(taskTemplates)
    .where(eq(taskTemplates.id, templateId))
    .limit(1);

  if (!template) {
    return { outcome: "no_active_source", added: 0, availableAfter: availableBefore };
  }

  const { items: generated, error } = await generateBatchedPayloadContent(template, needed);

  if (generated.length === 0) {
    return {
      outcome: "provider_unavailable",
      added: 0,
      availableAfter: availableBefore,
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  return db.transaction(async (tx) => {
    // Lock the source row first -- every concurrent replenishment attempt
    // for this same source acquires this same lock before touching its
    // items, which is what actually serializes them against each other.
    await tx
      .select({ id: payloadSources.id })
      .from(payloadSources)
      .where(eq(payloadSources.id, source.id))
      .for("update");

    const existingRows = await tx
      .select({ content: payloadItems.content })
      .from(payloadItems)
      .where(eq(payloadItems.sourceId, source.id));
    const seen = new Set(existingRows.map((row) => normalizeForDedup(row.content)));

    const [{ n: freshAvailable }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(payloadItems)
      .where(and(eq(payloadItems.sourceId, source.id), eq(payloadItems.status, "available")));

    const headroom = Math.min(
      PAYLOAD_REPLENISH_TARGET - freshAvailable,
      PAYLOAD_MAX_AVAILABLE - freshAvailable
    );

    const toInsert: string[] = [];
    for (const item of generated) {
      if (toInsert.length >= headroom) break;
      const key = normalizeForDedup(item);
      if (seen.has(key)) continue;
      seen.add(key);
      toInsert.push(item);
    }

    if (toInsert.length === 0) {
      return {
        outcome: headroom <= 0 ? "at_ceiling" : ("no_new_content" as PayloadReplenishOutcome),
        added: 0,
        availableAfter: freshAvailable,
      };
    }

    await tx.insert(payloadItems).values(
      toInsert.map((content) => ({
        sourceId: source.id,
        templateId: source.templateId,
        content,
      }))
    );

    return {
      outcome: "replenished" as PayloadReplenishOutcome,
      added: toInsert.length,
      availableAfter: freshAvailable + toInsert.length,
    };
  });
}
