ALTER TABLE "automations" DROP CONSTRAINT "automations_trigger_check";--> statement-breakpoint
ALTER TABLE "automations" ADD COLUMN "actions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "automations" ADD COLUMN "times" integer;--> statement-breakpoint
ALTER TABLE "automations" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "automations" ADD COLUMN "format" text DEFAULT 'json' NOT NULL;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_format_check" CHECK ("automations"."format" in ('json', 'slack', 'teams'));--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_trigger_check" CHECK ("automations"."trigger" in ('brand.released', 'asset.expiring', 'governance', 'check.refused', 'fix.opened', 'review.waiting'));