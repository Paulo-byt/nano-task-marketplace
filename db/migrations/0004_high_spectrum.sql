CREATE INDEX "applications_applicant_id_idx" ON "applications" USING btree ("applicant_id");--> statement-breakpoint
CREATE INDEX "fraud_assessments_application_id_idx" ON "fraud_assessments" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_nonce_idx" ON "sessions" USING btree ("nonce");--> statement-breakpoint
CREATE INDEX "tasks_creator_id_idx" ON "tasks" USING btree ("creator_id");