CREATE TABLE "email_domains" (
	"domain" text PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"token" text NOT NULL,
	"verified_at" timestamp with time zone,
	"join" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_domains" ADD CONSTRAINT "email_domains_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_domains_org_idx" ON "email_domains" USING btree ("organization_id");--> statement-breakpoint
-- Each single sign-on's domain becomes the organization's first email domain, proved or not as it was.
INSERT INTO "email_domains" ("domain", "organization_id", "token", "verified_at", "created_at")
SELECT "domain", "organization_id", coalesce("token", 'artbucket-' || md5(random()::text)), CASE WHEN "domain_verified" THEN now() END, "created_at" FROM "sso_providers";
