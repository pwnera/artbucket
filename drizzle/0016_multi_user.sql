CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"organization_id" uuid,
	"workspace_id" uuid,
	"actor" text NOT NULL,
	"user_id" text,
	"key_id" uuid,
	"action" text NOT NULL,
	"target" text,
	"detail" jsonb,
	"ip" text
);
--> statement-breakpoint
CREATE TABLE "grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid,
	"resource" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grants_user_resource_unique" UNIQUE("user_id","resource","resource_id"),
	CONSTRAINT "grants_resource_check" CHECK ("grants"."resource" in ('organization', 'workspace', 'collection', 'asset')),
	CONSTRAINT "grants_scope_check" CHECK ("grants"."scope" in ('read', 'propose', 'write', 'admin')),
	CONSTRAINT "grants_workspace_check" CHECK (("grants"."resource" = 'organization') = ("grants"."workspace_id" is null))
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid,
	"email" text NOT NULL,
	"resource" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invitations_scope_check" CHECK ("invitations"."scope" in ('read', 'propose', 'write', 'admin'))
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"collection_id" uuid,
	"asset_id" uuid,
	"name" text,
	"token" text NOT NULL,
	"password_hash" text,
	"expires_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_links_token_unique" UNIQUE("token"),
	CONSTRAINT "share_links_kind_check" CHECK ("share_links"."kind" in ('view', 'upload')),
	CONSTRAINT "share_links_target_check" CHECK (("share_links"."kind" = 'view' and num_nonnulls("share_links"."collection_id", "share_links"."asset_id") = 1) or ("share_links"."kind" = 'upload' and "share_links"."asset_id" is null))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_org_slug_unique" UNIQUE("organization_id","slug")
);
--> statement-breakpoint
ALTER TABLE "assets" DROP CONSTRAINT "assets_sha256_unique";--> statement-breakpoint
ALTER TABLE "brands" DROP CONSTRAINT "brands_slug_unique";--> statement-breakpoint
DROP INDEX "activity_at_idx";--> statement-breakpoint
DROP INDEX "assets_created_at_idx";--> statement-breakpoint
DROP INDEX "brands_one_default";--> statement-breakpoint
-- Everything that exists moves into one workspace of one organization, made here.
INSERT INTO "organizations" ("slug", "name") VALUES ('default', 'Default');--> statement-breakpoint
INSERT INTO "workspaces" ("organization_id", "slug", "name") SELECT "id", 'library', 'Library' FROM "organizations";--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
UPDATE "activity" SET "workspace_id" = (SELECT "id" FROM "workspaces");--> statement-breakpoint
ALTER TABLE "activity" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
UPDATE "api_keys" SET "workspace_id" = (SELECT "id" FROM "workspaces");--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
UPDATE "assets" SET "workspace_id" = (SELECT "id" FROM "workspaces");--> statement-breakpoint
ALTER TABLE "assets" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
UPDATE "brands" SET "workspace_id" = (SELECT "id" FROM "workspaces");--> statement-breakpoint
ALTER TABLE "brands" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
UPDATE "collections" SET "workspace_id" = (SELECT "id" FROM "workspaces");--> statement-breakpoint
ALTER TABLE "collections" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "fields" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
UPDATE "fields" SET "workspace_id" = (SELECT "id" FROM "workspaces");--> statement-breakpoint
ALTER TABLE "fields" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_searches" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
UPDATE "saved_searches" SET "workspace_id" = (SELECT "id" FROM "workspaces");--> statement-breakpoint
ALTER TABLE "saved_searches" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "fields" DROP CONSTRAINT "fields_pkey";--> statement-breakpoint
ALTER TABLE "fields" ADD CONSTRAINT "fields_workspace_id_key_pk" PRIMARY KEY("workspace_id","key");--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "agent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "activity" SET "agent" = true WHERE "actor" <> 'web';--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_org_at_idx" ON "audit" USING btree ("organization_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_user_idx" ON "audit" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "grants_org_idx" ON "grants" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitations_org_idx" ON "invitations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "share_links_workspace_idx" ON "share_links" USING btree ("workspace_id");--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fields" ADD CONSTRAINT "fields_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_workspace_at_idx" ON "activity" USING btree ("workspace_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "assets_workspace_created_at_idx" ON "assets" USING btree ("workspace_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "brands_one_default" ON "brands" USING btree ("workspace_id") WHERE "brands"."is_default";--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_workspace_sha256_unique" UNIQUE("workspace_id","sha256");--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_workspace_slug_unique" UNIQUE("workspace_id","slug");