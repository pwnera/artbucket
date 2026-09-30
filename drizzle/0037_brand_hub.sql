ALTER TABLE "brands" ADD COLUMN "visibility" text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "hub_portal_id" uuid;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_hub_portal_id_portals_id_fk" FOREIGN KEY ("hub_portal_id") REFERENCES "public"."portals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_visibility_check" CHECK ("brands"."visibility" in ('private', 'public'));