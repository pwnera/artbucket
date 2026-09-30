CREATE TABLE "brand_previews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"ref" text NOT NULL,
	"title" text,
	"commit" text,
	"token" text NOT NULL,
	"state" jsonb NOT NULL,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "brand_previews_token_unique" UNIQUE("token"),
	CONSTRAINT "brand_previews_brand_ref_unique" UNIQUE("brand_id","ref"),
	CONSTRAINT "brand_previews_ref_check" CHECK (char_length("brand_previews"."ref") between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "brand_sources" (
	"brand_id" uuid PRIMARY KEY NOT NULL,
	"remote" text NOT NULL,
	"branch" text DEFAULT 'main' NOT NULL,
	"path" text DEFAULT '' NOT NULL,
	"commit" text,
	"base" jsonb,
	"paths" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brand_previews" ADD CONSTRAINT "brand_previews_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_sources" ADD CONSTRAINT "brand_sources_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;