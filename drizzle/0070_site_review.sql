ALTER TABLE "site_deployments" DROP CONSTRAINT "site_deployments_state_check";--> statement-breakpoint
ALTER TABLE "site_deployments" ADD COLUMN "flags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "site_deployments" ADD CONSTRAINT "site_deployments_state_check" CHECK ("site_deployments"."state" in ('checking', 'live', 'failed', 'replaced', 'held'));