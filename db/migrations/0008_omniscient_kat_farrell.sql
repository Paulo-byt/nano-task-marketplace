CREATE TYPE "public"."task_template_status" AS ENUM('active', 'paused', 'archived');--> statement-breakpoint
CREATE TABLE "task_template_generation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"trigger_key" text NOT NULL,
	"generated_task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" "task_category" NOT NULL,
	"difficulty" "task_difficulty" NOT NULL,
	"estimated_time" text NOT NULL,
	"reward_usdc" numeric(10, 2) NOT NULL,
	"status" "task_template_status" DEFAULT 'active' NOT NULL,
	"pool_total_usdc" numeric(10, 2) DEFAULT '0' NOT NULL,
	"pool_allocated_usdc" numeric(10, 2) DEFAULT '0' NOT NULL,
	"pool_funding_tx_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_templates_pool_allocation_check" CHECK ("task_templates"."pool_allocated_usdc" <= "task_templates"."pool_total_usdc")
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "template_id" uuid;--> statement-breakpoint
ALTER TABLE "task_template_generation_events" ADD CONSTRAINT "task_template_generation_events_template_id_task_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."task_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_template_generation_events" ADD CONSTRAINT "task_template_generation_events_generated_task_id_tasks_id_fk" FOREIGN KEY ("generated_task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "task_template_generation_events_template_trigger_unique" ON "task_template_generation_events" USING btree ("template_id","trigger_key");--> statement-breakpoint
CREATE INDEX "task_templates_creator_id_idx" ON "task_templates" USING btree ("creator_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_template_id_task_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."task_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_template_id_idx" ON "tasks" USING btree ("template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_funding_tx_hash_unique" ON "tasks" USING btree ("funding_tx_hash");