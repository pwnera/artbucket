CREATE TABLE "brand_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"kind" text NOT NULL,
	"name" text,
	"actor" text NOT NULL,
	"changed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_versions_brand_number_unique" UNIQUE("brand_id","number"),
	CONSTRAINT "brand_versions_kind_check" CHECK ("brand_versions"."kind" in ('baseline', 'edit', 'restore'))
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brands_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "brand_rules" DROP CONSTRAINT "brand_rules_key_context_unique";--> statement-breakpoint
-- Rules that exist already move into a default brand, made here.
ALTER TABLE "brand_rules" ADD COLUMN "brand_id" uuid;--> statement-breakpoint
INSERT INTO "brands" ("slug", "name", "is_default") VALUES ('default', 'Default', true);--> statement-breakpoint
UPDATE "brand_rules" SET "brand_id" = (SELECT "id" FROM "brands" WHERE "is_default");--> statement-breakpoint
ALTER TABLE "brand_rules" ALTER COLUMN "brand_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_versions" ADD CONSTRAINT "brand_versions_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brands_one_default" ON "brands" USING btree ("is_default") WHERE "brands"."is_default";--> statement-breakpoint
ALTER TABLE "brand_rules" ADD CONSTRAINT "brand_rules_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_rules" ADD CONSTRAINT "brand_rules_brand_key_context_unique" UNIQUE NULLS NOT DISTINCT("brand_id","key","context");