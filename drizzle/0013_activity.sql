CREATE TABLE "activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"verb" text NOT NULL,
	"asset_id" uuid,
	"label" text NOT NULL,
	"detail" jsonb
);
--> statement-breakpoint
CREATE INDEX "activity_at_idx" ON "activity" USING btree ("at" DESC NULLS LAST);