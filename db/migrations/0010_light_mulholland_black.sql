CREATE TYPE "public"."payload_item_status" AS ENUM('available', 'assigned');--> statement-breakpoint
CREATE TYPE "public"."payload_source_kind" AS ENUM('manual');--> statement-breakpoint
CREATE TYPE "public"."payload_source_status" AS ENUM('active', 'paused');--> statement-breakpoint
CREATE TYPE "public"."template_payload_mode" AS ENUM('self_contained', 'payload_sourced');--> statement-breakpoint
CREATE TABLE "payload_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"content" text NOT NULL,
	"status" "payload_item_status" DEFAULT 'available' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payload_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"kind" "payload_source_kind" DEFAULT 'manual' NOT NULL,
	"label" text,
	"status" "payload_source_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_templates" ADD COLUMN "payload_mode" "template_payload_mode" DEFAULT 'self_contained' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "payload_item_id" uuid;--> statement-breakpoint
ALTER TABLE "payload_items" ADD CONSTRAINT "payload_items_source_id_payload_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."payload_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payload_items" ADD CONSTRAINT "payload_items_template_id_task_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."task_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payload_sources" ADD CONSTRAINT "payload_sources_template_id_task_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."task_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payload_items_source_id_idx" ON "payload_items" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "payload_items_template_status_idx" ON "payload_items" USING btree ("template_id","status");--> statement-breakpoint
CREATE INDEX "payload_sources_template_id_idx" ON "payload_sources" USING btree ("template_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_payload_item_id_payload_items_id_fk" FOREIGN KEY ("payload_item_id") REFERENCES "public"."payload_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_payload_item_id_idx" ON "tasks" USING btree ("payload_item_id");