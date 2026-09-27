ALTER TABLE "assets" ADD COLUMN "rights" jsonb;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "origin" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "parent_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "generator" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "prompt" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "c2pa" jsonb;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "superseded_by" uuid;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_parent_asset_id_assets_id_fk" FOREIGN KEY ("parent_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_superseded_by_assets_id_fk" FOREIGN KEY ("superseded_by") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_origin_check" CHECK ("assets"."origin" in ('shot', 'licensed', 'generated'));--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_not_superseded_by_self" CHECK ("assets"."superseded_by" <> "assets"."id");