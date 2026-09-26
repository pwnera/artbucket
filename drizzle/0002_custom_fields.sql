CREATE TABLE "fields" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"type" text NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fields_type_check" CHECK ("fields"."type" in ('text', 'number', 'date', 'boolean', 'select'))
);
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "fields" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "assets" drop column "search";--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple', regexp_replace(filename, '[._-]+', ' ', 'g')), 'A') || setweight(to_tsvector('simple', tags), 'A') || setweight(jsonb_to_tsvector('simple', coalesce(metadata, '{}'), '["string"]'), 'B') || setweight(jsonb_to_tsvector('simple', fields, '["string"]'), 'B')) STORED NOT NULL;--> statement-breakpoint
-- Dropping "search" dropped its index; drizzle-kit doesn't notice.
CREATE INDEX "assets_search_idx" ON "assets" USING gin ("search");