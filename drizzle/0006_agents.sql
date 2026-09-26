CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"hash" text NOT NULL,
	"scope" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_hash_unique" UNIQUE("hash"),
	CONSTRAINT "api_keys_scope_check" CHECK ("api_keys"."scope" in ('read', 'propose', 'write', 'admin'))
);
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "proposed_tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_status_check" CHECK ("assets"."status" in ('active', 'proposed'));