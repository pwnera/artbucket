CREATE TABLE "brand_rule_assets" (
	"rule_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "brand_rule_assets_rule_id_asset_id_pk" PRIMARY KEY("rule_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "brand_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"context" text,
	"type" text NOT NULL,
	"value" jsonb NOT NULL,
	"usage" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_rules_key_context_unique" UNIQUE NULLS NOT DISTINCT("key","context"),
	CONSTRAINT "brand_rules_type_check" CHECK ("brand_rules"."type" in ('color', 'text', 'number', 'list'))
);
--> statement-breakpoint
ALTER TABLE "brand_rule_assets" ADD CONSTRAINT "brand_rule_assets_rule_id_brand_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."brand_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_rule_assets" ADD CONSTRAINT "brand_rule_assets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_rule_assets_asset_idx" ON "brand_rule_assets" USING btree ("asset_id");