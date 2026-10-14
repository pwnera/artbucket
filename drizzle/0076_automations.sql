CREATE TABLE "automation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"automation_id" uuid NOT NULL,
	"key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"next_at" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_runs_key_unique" UNIQUE("automation_id","key"),
	CONSTRAINT "automation_runs_status_check" CHECK ("automation_runs"."status" in ('pending', 'delivered', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "automations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"trigger" text NOT NULL,
	"brand_id" uuid,
	"days" integer,
	"action" text NOT NULL,
	"emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"url" text,
	"secret" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automations_trigger_check" CHECK ("automations"."trigger" in ('brand.released', 'asset.expiring')),
	CONSTRAINT "automations_action_check" CHECK ("automations"."action" in ('email', 'webhook'))
);
--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_runs_automation_idx" ON "automation_runs" USING btree ("automation_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "automation_runs_due_idx" ON "automation_runs" USING btree ("next_at") WHERE "automation_runs"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "automations_project_idx" ON "automations" USING btree ("project_id");