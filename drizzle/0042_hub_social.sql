CREATE TABLE "hub_collections" (
	"slug" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL,
	"brands" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hub_follows" (
	"user_id" text NOT NULL,
	"brand_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_follows_user_id_brand_id_pk" PRIMARY KEY("user_id","brand_id")
);
--> statement-breakpoint
ALTER TABLE "hub_follows" ADD CONSTRAINT "hub_follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_follows" ADD CONSTRAINT "hub_follows_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hub_follows_brand_idx" ON "hub_follows" USING btree ("brand_id");