CREATE TYPE "public"."task_funding_status" AS ENUM('unfunded', 'funded', 'released', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."payout_status" ADD VALUE 'failed';--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "funding_status" "task_funding_status" DEFAULT 'unfunded' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "funding_tx_hash" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "funded_amount_usdc" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "funded_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "payouts_application_unique" ON "payouts" USING btree ("application_id");