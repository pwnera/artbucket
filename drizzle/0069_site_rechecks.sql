ALTER TABLE "site_deployments" ADD COLUMN "problems" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "site_deployments" ADD COLUMN "checked_at" timestamp with time zone;