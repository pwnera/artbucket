ALTER TABLE "brand_pages" ADD COLUMN "parent" text;--> statement-breakpoint
ALTER TABLE "brand_pages" ADD COLUMN "eyebrow" text;--> statement-breakpoint
ALTER TABLE "brand_pages" ADD COLUMN "lede" text;--> statement-breakpoint
ALTER TABLE "brand_pages" ADD COLUMN "cover" uuid;--> statement-breakpoint
ALTER TABLE "brand_pages" ADD COLUMN "icon" text;--> statement-breakpoint
ALTER TABLE "brand_pages" ADD COLUMN "audience" text DEFAULT 'everyone' NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_pages" ADD COLUMN "tabs" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_pages" ADD COLUMN "aliases" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_rules" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "brand_rules" ADD COLUMN "spec" jsonb;--> statement-breakpoint
ALTER TABLE "brand_versions" ADD COLUMN "theme" jsonb;--> statement-breakpoint
ALTER TABLE "brand_versions" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "brand_versions" ADD COLUMN "note_image" uuid;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "theme" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_pages" ADD CONSTRAINT "brand_pages_audience_check" CHECK ("brand_pages"."audience" in ('everyone', 'partners', 'members'));