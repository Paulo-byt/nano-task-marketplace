CREATE TYPE "public"."submission_verdict" AS ENUM('meets_requirements', 'partially_meets_requirements', 'does_not_meet_requirements');--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"content" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"evaluation_verdict" "submission_verdict",
	"evaluation_feedback" text,
	"evaluated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_application_unique" ON "submissions" USING btree ("application_id");