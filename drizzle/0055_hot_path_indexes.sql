CREATE INDEX IF NOT EXISTS "event_days_brand_day_idx" ON "event_days" USING btree ("brand_id","day") WHERE "event_days"."brand_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_brand_day_idx" ON "events" USING btree ("brand_id","day") WHERE "events"."brand_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_day_idx" ON "events" USING btree ("day");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "renditions_workspace_created_idx" ON "renditions" USING btree ("workspace_id","created_at");