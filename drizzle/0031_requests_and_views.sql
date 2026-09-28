CREATE TABLE "page_views" (
	"portal_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"page" text NOT NULL,
	"day" date NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "page_views_portal_id_brand_id_page_day_pk" PRIMARY KEY("portal_id","brand_id","page","day")
);
--> statement-breakpoint
ALTER TABLE "portal_requests" ADD COLUMN "kind" text DEFAULT 'access' NOT NULL;--> statement-breakpoint
ALTER TABLE "portal_requests" ADD COLUMN "page" text;--> statement-breakpoint
ALTER TABLE "portal_requests" ADD COLUMN "section" text;--> statement-breakpoint
ALTER TABLE "page_views" ADD CONSTRAINT "page_views_portal_id_portals_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_views" ADD CONSTRAINT "page_views_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_requests" ADD CONSTRAINT "portal_requests_kind_check" CHECK ("portal_requests"."kind" in ('access', 'asset', 'review', 'question'));