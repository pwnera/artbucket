CREATE TABLE "site_deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"path" text DEFAULT '/' NOT NULL,
	"kind" text NOT NULL,
	"state" text DEFAULT 'checking' NOT NULL,
	"prefix" text NOT NULL,
	"files" integer DEFAULT 0 NOT NULL,
	"bytes" bigint DEFAULT 0 NOT NULL,
	"manifest" jsonb,
	"commit" text,
	"ref" text,
	"error" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_deployments_state_check" CHECK ("site_deployments"."state" in ('checking', 'live', 'failed', 'replaced')),
	CONSTRAINT "site_deployments_kind_check" CHECK ("site_deployments"."kind" in ('guidelines', 'landing', 'docs', 'storybook'))
);
--> statement-breakpoint
ALTER TABLE "portals" ADD COLUMN "kind" text DEFAULT 'portal' NOT NULL;--> statement-breakpoint
ALTER TABLE "site_deployments" ADD CONSTRAINT "site_deployments_site_id_portals_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."portals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_deployments_site_idx" ON "site_deployments" USING btree ("site_id","path","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "site_deployments_live_unique" ON "site_deployments" USING btree ("site_id","path") WHERE "site_deployments"."state" = 'live';--> statement-breakpoint
ALTER TABLE "portals" ADD CONSTRAINT "portals_kind_check" CHECK ("portals"."kind" in ('portal', 'guidelines', 'landing', 'docs', 'storybook'));