ALTER TABLE "email_domains" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "sso_providers" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "email_domains" ADD CONSTRAINT "email_domains_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_providers" ADD CONSTRAINT "sso_providers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;