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
} from "drizzle-orm/pg-core";

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
