ALTER TABLE "domains" ADD COLUMN "app" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Every verified domain without a portal served the app until now: it still does. New ones start off.
UPDATE "domains" SET "app" = true WHERE "verified_at" IS NOT NULL AND "portal_id" IS NULL;
