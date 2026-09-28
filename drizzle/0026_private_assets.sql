ALTER TABLE "domains" DROP CONSTRAINT "domains_portal_id_portals_id_fk";
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "primary" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_portal_id_portals_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "domains_primary_unique" ON "domains" USING btree ("organization_id") WHERE "domains"."primary";--> statement-breakpoint
-- Links in email kept pointing at the oldest verified app domain: that one is the default now.
UPDATE "domains" SET "primary" = true WHERE "host" IN (
  SELECT DISTINCT ON ("organization_id") "host" FROM "domains"
  WHERE "portal_id" IS NULL AND "verified_at" IS NOT NULL
  ORDER BY "organization_id", "created_at"
);
