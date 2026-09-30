ALTER TABLE "assets" ADD COLUMN "via" text;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_via_check" CHECK ("assets"."via" in ('agent', 'import'));