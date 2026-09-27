ALTER TABLE "assets" DROP CONSTRAINT "assets_status_check";--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "stack_id" uuid;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "version" integer;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "current" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "assets_one_current" ON "assets" USING btree ("stack_id") WHERE "assets"."current";--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_stack_version_unique" UNIQUE("stack_id","version");--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_stacked_check" CHECK (("assets"."stack_id" is null) = ("assets"."version" is null));--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_status_check" CHECK ("assets"."status" in ('draft', 'proposed', 'active', 'archived', 'rejected'));