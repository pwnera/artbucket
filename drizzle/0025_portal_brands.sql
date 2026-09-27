CREATE TABLE "portal_brands" (
	"portal_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "portal_brands_portal_id_brand_id_pk" PRIMARY KEY("portal_id","brand_id")
);
--> statement-breakpoint
ALTER TABLE "portal_brands" ADD CONSTRAINT "portal_brands_portal_id_portals_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_brands" ADD CONSTRAINT "portal_brands_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "portal_brands_brand_idx" ON "portal_brands" USING btree ("brand_id");