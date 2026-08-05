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

export const applicationStatusEnum = pgEnum("application_status", [
  "applied",
  "approved",
  "rejected",
  "completed",
]);

export const payoutStatusEnum = pgEnum("payout_status", [
  "pending",
  "completed",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "task",
  "payment",
  "wallet",
  "system",
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

export const tasks = pgTable("tasks", {
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
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    taskApplicantUnique: uniqueIndex("applications_task_applicant_unique").on(
      table.taskId,
      table.applicantId
    ),
  })
);

export const payouts = pgTable("payouts", {
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
});

export const notifications = pgTable("notifications", {
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
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  nonce: text("nonce"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
