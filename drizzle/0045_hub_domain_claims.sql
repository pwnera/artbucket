CREATE TABLE "hub_offers_refused" (
	"organization_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_offers_refused_organization_id_brand_id_pk" PRIMARY KEY("organization_id","brand_id")
);
--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "hub_moved_to" text;--> statement-breakpoint
ALTER TABLE "hub_offers_refused" ADD CONSTRAINT "hub_offers_refused_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_offers_refused" ADD CONSTRAINT "hub_offers_refused_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;