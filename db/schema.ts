import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  uniqueIndex,
  index,
  jsonb,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const taskCategoryEnum = pgEnum("task_category", [
  "Writing",
  "AI",
  "Research",
  "Design",
  "Social",
]);

export const taskDifficultyEnum = pgEnum("task_difficulty", [
  "Beginner",
  "Intermediate",
  "Advanced",
]);

export const taskStatusEnum = pgEnum("task_status", ["open", "closed"]);

export const taskFundingStatusEnum = pgEnum("task_funding_status", [
  "unfunded",
  "funded",
  "released",
  "cancelled",
]);

export const applicationStatusEnum = pgEnum("application_status", [
  "applied",
  "approved",
  "rejected",
  "completed",
]);

export const payoutStatusEnum = pgEnum("payout_status", [
  "pending",
  "completed",
  "failed",
  "cancelled",
  "retrying",
]);

export const submissionVerdictEnum = pgEnum("submission_verdict", [
  "meets_requirements",
  "partially_meets_requirements",
  "does_not_meet_requirements",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "task",
  "payment",
  "wallet",
  "system",
]);

export const fraudRiskLevelEnum = pgEnum("fraud_risk_level", [
  "low",
  "medium",
  "high",
]);

export const taskTemplateStatusEnum = pgEnum("task_template_status", [
  "active",
  "paused",
  "archived",
]);

// Phase 11C (payload-based tasks): whether a template clones itself
// verbatim per instance (existing behavior) or needs a claimed
// payload_items row per instance. Defaulted to self_contained everywhere
// below so every existing template is completely unaffected.
export const templatePayloadModeEnum = pgEnum("template_payload_mode", [
  "self_contained",
  "payload_sourced",
]);

// Phase 11C: how a payload source's items got there. Grown additively, as
// documented from the start (csv_import, api_feed were the anticipated
// future values; ai_generated is the first of those to actually land, for
// AI-Assisted Supply) -- never blindly expanded ahead of need. 'manual'
// remains the default for every source created without an explicit kind,
// so nothing about Steps 1-4's existing behavior changes.
export const payloadSourceKindEnum = pgEnum("payload_source_kind", [
  "manual",
  "ai_generated",
]);

// Phase 11C: mirrors task_template_status's own minimalism, minus
// "archived" -- nothing yet needs a third state here. Pausing a source
// stops NEW claims from drawing on it; it never touches any item's own
// status (see payload_item_status below).
export const payloadSourceStatusEnum = pgEnum("payload_source_status", [
  "active",
  "paused",
]);

// Phase 11C: exactly two states, deliberately -- everything about "what
// happened to the task" is already tracked by tasks/applications/payouts/
// submissions and reachable via tasks.payloadItemId. Duplicating that
// here would drift out of sync with the real state machine for nothing.
export const payloadItemStatusEnum = pgEnum("payload_item_status", [
  "available",
  "assigned",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  walletAddress: text("wallet_address").notNull().unique(),
  displayName: text("display_name"),
  memberSince: timestamp("member_since", { withTimezone: true })
    .notNull()
    .defaultNow(),
  reputationScore: integer("reputation_score").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    rewardUsdc: numeric("reward_usdc", { precision: 10, scale: 2 }).notNull(),
    category: taskCategoryEnum("category").notNull(),
    difficulty: taskDifficultyEnum("difficulty").notNull(),
    estimatedTime: text("estimated_time").notNull(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id),
    status: taskStatusEnum("status").notNull().default("open"),
    fundingStatus: taskFundingStatusEnum("funding_status")
      .notNull()
      .default("unfunded"),
    fundingTxHash: text("funding_tx_hash"),
    fundedAmountUsdc: numeric("funded_amount_usdc", { precision: 10, scale: 2 }),
    fundedAt: timestamp("funded_at", { withTimezone: true }),
    // Phase 12 (never-ending task supply, schema-only step): nullable --
    // every task posted manually, and every task that exists today, has no
    // template. Set only for an instance generated from a task_templates
    // pool (Phase 12's later, not-yet-built generation step); no other
    // write path ever touches this column yet.
    templateId: uuid("template_id").references(() => taskTemplates.id),
    // Phase 11C (payload-based tasks): nullable -- set only for an
    // instance generated from a payload_sourced template, whose gate 3
    // claimed this specific row at generation time. Write-once: this is
    // the permanent record of which item the task was CREATED with, never
    // revisited afterward, including on cancellation (payload_items.status
    // is what tracks current claim state; this column tracks history).
    payloadItemId: uuid("payload_item_id").references(() => payloadItems.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // Phase 9: getPostedTasksByCreator filters on this column with no
    // prior covering index.
    creatorIdIdx: index("tasks_creator_id_idx").on(table.creatorId),
    // Phase 11 (read-side, never-ending marketplace supply): getTasks()
    // filters on status + funding_status and paginates via a
    // (created_at, id) keyset cursor -- this composite index covers the
    // whole query as one equality-then-range scan, so listing cost depends
    // on page size, never on total historical task count.
    marketplaceAvailabilityIdx: index(
      "tasks_marketplace_availability_idx"
    ).on(table.status, table.fundingStatus, table.createdAt, table.id),
    // Phase 12: dashboard drill-down ("instances for this template") and
    // the future generation path's own lookups will filter on this column.
    templateIdIdx: index("tasks_template_id_idx").on(table.templateId),
    // Phase 11C: symmetric with templateIdIdx above -- supports the rare,
    // non-hot-path "which task(s) has this item ever been attached to"
    // reverse lookup; the hot reservation path itself never queries tasks
    // at all, it only ever touches payload_items directly.
    payloadItemIdIdx: index("tasks_payload_item_id_idx").on(
      table.payloadItemId
    ),
    // Phase 12: closes the residual isFundingTxHashUsed's own doc comment
    // already named -- that check was previously an application-level
    // SELECT-before-UPDATE race, not a database guarantee. NULL is exempt
    // from uniqueness (every unfunded task has funding_tx_hash = null), so
    // this is safe against all existing data; only two tasks sharing the
    // same real, non-null funding transaction hash would violate it.
    fundingTxHashUnique: uniqueIndex("tasks_funding_tx_hash_unique").on(
      table.fundingTxHash
    ),
  })
);

/**
 * A repeatable task definition plus the funding pool that backs its future
 * instances, in one row (Phase 12, schema-only step -- see the Never-Ending
 * Task Supply Phase 2 design review). No code yet reads or writes this
 * table; it exists so the next phase's generation logic has somewhere
 * race-safe to atomically debit against, using the same conditional-UPDATE
 * idiom as markTaskFunded and approveApplication elsewhere in this
 * codebase, not a new pattern.
 *
 * poolTotalUsdc and poolAllocatedUsdc are deliberately numbers, not an
 * enum: unlike a single task's binary funded/not-funded state, a pool's
 * funding is continuous -- partially consumed, fully consumed, replenished
 * -- and the two numbers express that directly. Remaining capacity is
 * always poolTotalUsdc - poolAllocatedUsdc; no instance may ever be
 * generated for less than that.
 *
 * category/difficulty deliberately reuse taskCategoryEnum/
 * taskDifficultyEnum rather than a parallel enum -- a template's instances
 * are ordinary tasks and must be describable with the exact same values.
 */
export const taskTemplates = pgTable(
  "task_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: taskCategoryEnum("category").notNull(),
    difficulty: taskDifficultyEnum("difficulty").notNull(),
    estimatedTime: text("estimated_time").notNull(),
    rewardUsdc: numeric("reward_usdc", { precision: 10, scale: 2 }).notNull(),
    status: taskTemplateStatusEnum("status").notNull().default("active"),
    poolTotalUsdc: numeric("pool_total_usdc", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    poolAllocatedUsdc: numeric("pool_allocated_usdc", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    poolFundingTxHash: text("pool_funding_tx_hash"),
    // Phase 11C (payload-based tasks): governs whether generation clones
    // this template verbatim (self_contained, the existing behavior) or
    // must claim a payload_items row per instance (payload_sourced).
    // Defaulted so every template created before this phase is completely
    // unaffected.
    payloadMode: templatePayloadModeEnum("payload_mode")
      .notNull()
      .default("self_contained"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    creatorIdIdx: index("task_templates_creator_id_idx").on(table.creatorId),
    // Database-enforced backstop alongside whatever atomic conditional
    // UPDATE the generation step (not yet built) uses to debit the pool --
    // the same layered-guard philosophy already used throughout this
    // schema, never relying on application code alone.
    poolAllocationCheck: check(
      "task_templates_pool_allocation_check",
      sql`${table.poolAllocatedUsdc} <= ${table.poolTotalUsdc}`
    ),
    // Phase C (platform funding/pool mechanics): mirrors
    // tasks_funding_tx_hash_unique exactly, and closes the same class of
    // gap for template pools -- the same real, verified funding
    // transaction must never back two different templates' pools at once.
    // NULL is exempt from uniqueness (every unfunded template has
    // pool_funding_tx_hash = null), so this is safe against all existing
    // rows. Unlike the tasks-side column, this one is a "most recent
    // funding" pointer that legitimately changes on replenishment -- the
    // index only ever compares CURRENT values across rows, so a later,
    // different, independently-verified replenishment transaction is
    // never blocked by an earlier one this same template already held.
    poolFundingTxHashUnique: uniqueIndex(
      "task_templates_pool_funding_tx_hash_unique"
    ).on(table.poolFundingTxHash),
  })
);

/**
 * The idempotency ledger for template-driven generation (Phase 12,
 * schema-only step). One row per generation attempt, keyed by whatever
 * triggered it -- the unique constraint below, not application logic, is
 * what makes a retried or duplicated trigger a safe no-op instead of a
 * second instance, the same role payouts_application_unique already plays
 * for a duplicate payout attempt. generatedTaskId is nullable because an
 * attempt against an exhausted pool legitimately produces no task.
 */
export const taskTemplateGenerationEvents = pgTable(
  "task_template_generation_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => taskTemplates.id),
    triggerKey: text("trigger_key").notNull(),
    generatedTaskId: uuid("generated_task_id").references(() => tasks.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    templateTriggerUnique: uniqueIndex(
      "task_template_generation_events_template_trigger_unique"
    ).on(table.templateId, table.triggerKey),
  })
);

/**
 * A named batch of input material attached to one template (Phase 11C,
 * payload-based tasks) -- operator bookkeeping and provenance, not a queue
 * itself. status is deliberately just active/paused: pausing stops NEW
 * claims from drawing on this source's items without touching any of
 * them, exactly mirroring task_templates.status's own "paused" semantics.
 * "Exhausted" is deliberately not a stored status -- it's a derived fact
 * (zero remaining available items) computed by querying payload_items
 * directly, never a column that could drift out of sync with the real
 * count.
 */
export const payloadSources = pgTable(
  "payload_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => taskTemplates.id),
    kind: payloadSourceKindEnum("kind").notNull().default("manual"),
    label: text("label"),
    status: payloadSourceStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    templateIdIdx: index("payload_sources_template_id_idx").on(
      table.templateId
    ),
  })
);

/**
 * One individual, atomically-claimable unit of input (Phase 11C,
 * payload-based tasks) -- a sentence, a URL, interpretation defined
 * entirely by its template's own instructions, never by this schema.
 * Exactly two states (payload_item_status) on purpose: everything about
 * "what happened to the task this item was claimed for" is already
 * tracked by tasks/applications/payouts/submissions and reachable via
 * tasks.payload_item_id -- duplicating that here would drift out of sync
 * with the real state machine for nothing.
 *
 * templateId is denormalized from payload_sources rather than reached
 * only via sourceId -- the reservation query (generation's gate 3, not
 * yet built) is the hottest path in this design and needs to filter "an
 * available item for this template" directly, without a join, the same
 * reason tasks.templateId exists directly on tasks rather than only
 * reachable via task_template_generation_events.
 */
export const payloadItems = pgTable(
  "payload_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => payloadSources.id),
    templateId: uuid("template_id")
      .notNull()
      .references(() => taskTemplates.id),
    content: text("content").notNull(),
    status: payloadItemStatusEnum("status").notNull().default("available"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    sourceIdIdx: index("payload_items_source_id_idx").on(table.sourceId),
    // The hot-path index: generation's gate 3 (not yet built) filters
    // exactly on these two columns together, so this composite index
    // makes "find an available item for this template" a direct range
    // scan -- the same reasoning as tasks_marketplace_availability_idx.
    templateStatusIdx: index("payload_items_template_status_idx").on(
      table.templateId,
      table.status
    ),
  })
);

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id),
    applicantId: uuid("applicant_id")
      .notNull()
      .references(() => users.id),
    status: applicationStatusEnum("status").notNull().default("applied"),
    appliedAt: timestamp("applied_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    taskApplicantUnique: uniqueIndex("applications_task_applicant_unique").on(
      table.taskId,
      table.applicantId
    ),
    // Phase 9: the single highest-value index in the schema -- filters
    // getMyTasks, every dashboard/earnings/profile query, and every
    // fraud-signal computation, all of which key on applicantId alone
    // (not covered by the composite unique index above, whose left
    // prefix only serves taskId-first lookups).
    applicantIdIdx: index("applications_applicant_id_idx").on(
      table.applicantId
    ),
  })
);

export const payouts = pgTable(
  "payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id),
    amountUsdc: numeric("amount_usdc", { precision: 10, scale: 2 }).notNull(),
    status: payoutStatusEnum("status").notNull().default("pending"),
    txHash: text("tx_hash"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    applicationUnique: uniqueIndex("payouts_application_unique").on(
      table.applicationId
    ),
  })
);

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id),
    content: text("content").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    evaluationVerdict: submissionVerdictEnum("evaluation_verdict"),
    evaluationFeedback: text("evaluation_feedback"),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }),
  },
  (table) => ({
    applicationUnique: uniqueIndex("submissions_application_unique").on(
      table.applicationId
    ),
  })
);

// Deliberately no unique index on applicationId -- unlike payouts/submissions
// (1:1), multiple fraud_assessments rows per application are allowed by
// design (Step 14 locked decision): a creator can re-run analysis and each
// run is preserved, not overwritten. signalsSnapshot stores the exact
// computed signal values used for that run, independent of the enum's
// column definitions, for auditability as signals evolve over time.
export const fraudAssessments = pgTable(
  "fraud_assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id),
    riskLevel: fraudRiskLevelEnum("risk_level").notNull(),
    explanation: text("explanation").notNull(),
    signalsSnapshot: jsonb("signals_snapshot").notNull(),
    analyzedAt: timestamp("analyzed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // Phase 9: no unique index exists here by design (multiple
    // assessments per application are allowed), so unlike
    // payouts/submissions this column had no covering index at all --
    // getLatestAssessmentsForApplications filters on it directly.
    applicationIdIdx: index("fraud_assessments_application_id_idx").on(
      table.applicationId
    ),
  })
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    description: text("description").notNull(),
    type: notificationTypeEnum("type").notNull(),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // Phase 9: getNotifications filters on this column with no prior
    // covering index.
    userIdIdx: index("notifications_user_id_idx").on(table.userId),
  })
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    nonce: text("nonce"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // Phase 9: findPendingSessionByNonce filters on this column on every
    // sign-in attempt, with no prior covering index.
    nonceIdx: index("sessions_nonce_idx").on(table.nonce),
  })
);
