CREATE TABLE "domains" (
	"host" text PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"portal_id" uuid,
	"token" text NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_collections" (
	"portal_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "portal_collections_portal_id_collection_id_pk" PRIMARY KEY("portal_id","collection_id")
);
--> statement-breakpoint
CREATE TABLE "portal_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portal_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"key_hash" text,
	"key_sealed" text,
	"expires_at" timestamp with time zone,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portal_requests_key_hash_unique" UNIQUE("key_hash"),
	CONSTRAINT "portal_requests_status_check" CHECK ("portal_requests"."status" in ('pending', 'approved', 'denied'))
);
--> statement-breakpoint
CREATE TABLE "portals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"intro" text,
	"access" text DEFAULT 'public' NOT NULL,
	"password_hash" text,
	"expires_at" timestamp with time zone,
	"presets" jsonb DEFAULT '["web","print","social"]'::jsonb NOT NULL,
	"theme" jsonb DEFAULT '{"logo":null,"accent":null,"background":null}'::jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portals_slug_unique" UNIQUE("slug"),
	CONSTRAINT "portals_access_check" CHECK ("portals"."access" in ('public', 'password', 'members')),
	CONSTRAINT "portals_password_check" CHECK ("portals"."access" <> 'password' or "portals"."password_hash" is not null)
);
--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_portal_id_portals_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_collections" ADD CONSTRAINT "portal_collections_portal_id_portals_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_collections" ADD CONSTRAINT "portal_collections_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_requests" ADD CONSTRAINT "portal_requests_portal_id_portals_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portals" ADD CONSTRAINT "portals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "domains_portal_unique" ON "domains" USING btree ("portal_id");--> statement-breakpoint
CREATE INDEX "portal_collections_collection_idx" ON "portal_collections" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "portal_requests_portal_idx" ON "portal_requests" USING btree ("portal_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "portals_workspace_idx" ON "portals" USING btree ("workspace_id");