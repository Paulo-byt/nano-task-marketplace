CREATE TYPE "public"."fraud_risk_level" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TABLE "fraud_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"risk_level" "fraud_risk_level" NOT NULL,
	"explanation" text NOT NULL,
	"signals_snapshot" jsonb NOT NULL,
	"analyzed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fraud_assessments" ADD CONSTRAINT "fraud_assessments_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;