import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  applications,
  payloadItems,
  payloadSources,
  submissions,
  taskTemplates,
  tasks,
} from "@/db/schema";

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
