ALTER TABLE "brand_pages" ADD COLUMN "translations" jsonb;--> statement-breakpoint
ALTER TABLE "brand_pages" ADD COLUMN "layout" text DEFAULT 'book' NOT NULL;--> statement-breakpoint
ALTER TABLE "portals" ADD COLUMN "site" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_pages" ADD CONSTRAINT "brand_pages_layout_check" CHECK ("brand_pages"."layout" in ('book', 'landing'));--> statement-breakpoint
-- Portals serve the latest publish now, not the draft (D15). Publish what visitors see today: the latest
-- version of every brand a portal carries, unless one is published already. A carried brand with no
-- versions serves live until its first edit, whose baseline is written as published (core/brand.ts tracked).
UPDATE "brand_versions" v SET "published_at" = now(), "published_by" = 'artbucket'
FROM (
  SELECT DISTINCT ON ("brand_id") "id", "brand_id" FROM "brand_versions"
  WHERE "brand_id" IN (SELECT "brand_id" FROM "portal_brands")
  ORDER BY "brand_id", "number" DESC
) l
WHERE v."id" = l."id"
  AND NOT EXISTS (SELECT 1 FROM "brand_versions" p WHERE p."brand_id" = l."brand_id" AND p."published_at" IS NOT NULL);
