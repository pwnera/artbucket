ALTER TABLE "site_deployments" DROP CONSTRAINT "site_deployments_state_check";--> statement-breakpoint
ALTER TABLE "site_deployments" ADD COLUMN "preview" text;--> statement-breakpoint
ALTER TABLE "site_deployments" ADD CONSTRAINT "site_deployments_state_check" CHECK ("site_deployments"."state" in ('checking', 'live', 'failed', 'replaced', 'held', 'preview'));