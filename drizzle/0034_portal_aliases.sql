CREATE TABLE "portal_aliases" (
	"slug" text PRIMARY KEY NOT NULL,
	"portal_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portal_aliases" ADD CONSTRAINT "portal_aliases_portal_id_portals_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portals"("id") ON DELETE cascade ON UPDATE no action;