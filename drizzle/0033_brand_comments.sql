CREATE TABLE "brand_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"page" text NOT NULL,
	"section" text,
	"parent_id" uuid,
	"body" text NOT NULL,
	"author_id" text,
	"author_key" uuid,
	"author" text NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_comments_body_check" CHECK (char_length("brand_comments"."body") between 1 and 4000),
	CONSTRAINT "brand_comments_resolved_check" CHECK ("brand_comments"."parent_id" is null or "brand_comments"."resolved_at" is null)
);
--> statement-breakpoint
ALTER TABLE "brand_comments" ADD CONSTRAINT "brand_comments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_comments" ADD CONSTRAINT "brand_comments_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_comments" ADD CONSTRAINT "brand_comments_parent_id_brand_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."brand_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_comments" ADD CONSTRAINT "brand_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_comments_brand_page_idx" ON "brand_comments" USING btree ("brand_id","page");--> statement-breakpoint
CREATE INDEX "brand_comments_parent_idx" ON "brand_comments" USING btree ("parent_id");