ALTER TABLE "assets" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple', regexp_replace(filename, '[._-]+', ' ', 'g')), 'A') || setweight(to_tsvector('simple', tags), 'A') || setweight(jsonb_to_tsvector('simple', coalesce(metadata, '{}'), '["string"]'), 'B')) STORED NOT NULL;--> statement-breakpoint
CREATE INDEX "assets_search_idx" ON "assets" USING gin ("search");--> statement-breakpoint
CREATE INDEX "assets_tags_idx" ON "assets" USING gin ("tags" jsonb_path_ops);