CREATE TABLE "sso_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" text,
	"issuer" text NOT NULL,
	"oidc_config" text NOT NULL,
	"saml_config" text,
	"domain" text NOT NULL,
	"domain_verified" boolean DEFAULT false NOT NULL,
	"token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sso_providers_provider_id_unique" UNIQUE("provider_id"),
	CONSTRAINT "sso_providers_organization_id_unique" UNIQUE("organization_id"),
	CONSTRAINT "sso_providers_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
ALTER TABLE "sso_providers" ADD CONSTRAINT "sso_providers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_providers" ADD CONSTRAINT "sso_providers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;