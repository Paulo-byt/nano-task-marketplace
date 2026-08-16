CREATE TABLE "platform_treasury_allowance_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"approved_amount_usdc" numeric(10, 2) NOT NULL,
	"approval_tx_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "platform_treasury_allowance_events_tx_hash_unique" ON "platform_treasury_allowance_events" USING btree ("approval_tx_hash");