CREATE TABLE "collection_assets" (
	"collection_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	CONSTRAINT "collection_assets_collection_id_asset_id_pk" PRIMARY KEY("collection_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "inherited" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "assets" drop column "search";
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple', regexp_replace(filename, '[._-]+', ' ', 'g')), 'A') || setweight(to_tsvector('simple', tags), 'A') || setweight(jsonb_to_tsvector('simple', coalesce(metadata, '{}'), '["string"]'), 'B') || setweight(jsonb_to_tsvector('simple', fields || inherited, '["string"]'), 'B')) STORED NOT NULL;
--> statement-breakpoint
ALTER TABLE "collection_assets" ADD CONSTRAINT "collection_assets_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "collection_assets" ADD CONSTRAINT "collection_assets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "collection_assets_asset_idx" ON "collection_assets" USING btree ("asset_id");
--> statement-breakpoint
-- Dropping "search" dropped its index; drizzle-kit doesn't notice.
CREATE INDEX "assets_search_idx" ON "assets" USING gin ("search");
