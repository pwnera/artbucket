CREATE TABLE "github_orgs" (
	"login" text PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"token" text NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hub_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"contact" text,
	"claimant_id" uuid,
	"proof" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_reports_kind_check" CHECK ("hub_reports"."kind" in ('report', 'claim')),
	CONSTRAINT "hub_reports_status_check" CHECK ("hub_reports"."status" in ('open', 'resolved'))
);
--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "hub_delisted" text;--> statement-breakpoint
ALTER TABLE "github_orgs" ADD CONSTRAINT "github_orgs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_reports" ADD CONSTRAINT "hub_reports_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_reports" ADD CONSTRAINT "hub_reports_claimant_id_organizations_id_fk" FOREIGN KEY ("claimant_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hub_reports_brand_idx" ON "hub_reports" USING btree ("brand_id","created_at" DESC NULLS LAST);