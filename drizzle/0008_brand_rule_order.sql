ALTER TABLE "brand_rules" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Existing rules keep the order they had: alphabetical by key.
UPDATE "brand_rules" SET "position" = r.n FROM (SELECT "key", dense_rank() OVER (ORDER BY "key") - 1 AS n FROM (SELECT DISTINCT "key" FROM "brand_rules") k) r WHERE r."key" = "brand_rules"."key";
