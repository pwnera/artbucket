CREATE TABLE "brand_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_pages_brand_slug_unique" UNIQUE("brand_id","slug")
);
--> statement-breakpoint
ALTER TABLE "brand_versions" ADD COLUMN "pages" jsonb;--> statement-breakpoint
ALTER TABLE "brand_versions" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "brand_versions" ADD COLUMN "published_by" text;--> statement-breakpoint
ALTER TABLE "brand_pages" ADD CONSTRAINT "brand_pages_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;