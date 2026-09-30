ALTER TABLE "brands" ADD COLUMN "visibility" text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_visibility_check" CHECK ("brands"."visibility" in ('private', 'public'));--> statement-breakpoint
-- Brands listed through a portal before visibility existed stay on show.
UPDATE "brands" SET "visibility" = 'public' WHERE "hub_portal_id" IS NOT NULL;