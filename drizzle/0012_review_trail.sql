ALTER TABLE "assets" DROP CONSTRAINT "assets_status_check";--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "proposed_by" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "review_note" text;--> statement-breakpoint
CREATE INDEX "assets_proposed_by_idx" ON "assets" USING btree ("proposed_by");--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_status_check" CHECK ("assets"."status" in ('active', 'proposed', 'rejected'));