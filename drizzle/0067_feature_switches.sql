-- Features turned on and off per organization or project (lib/features.ts), and the keys the core makes for them.
CREATE TABLE "feature_switches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid,
	"feature" text NOT NULL,
	"state" text NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_switches_place_unique" UNIQUE NULLS NOT DISTINCT("organization_id","project_id","feature"),
	CONSTRAINT "feature_switches_state_check" CHECK ("feature_switches"."state" in ('on', 'off'))
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "feature" text;--> statement-breakpoint
ALTER TABLE "feature_switches" ADD CONSTRAINT "feature_switches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_switches" ADD CONSTRAINT "feature_switches_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;