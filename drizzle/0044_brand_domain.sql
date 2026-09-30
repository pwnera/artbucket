ALTER TABLE "brands" ADD COLUMN "domain" text;--> statement-breakpoint
CREATE INDEX "brands_domain_idx" ON "brands" USING btree ("domain");