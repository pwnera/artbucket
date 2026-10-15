CREATE INDEX IF NOT EXISTS "activity_asset_at_idx" ON "activity" USING btree ("asset_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_parent_idx" ON "assets" USING btree ("parent_asset_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_superseded_by_idx" ON "assets" USING btree ("superseded_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_project_at_idx" ON "audit" USING btree ("project_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "collections_project_idx" ON "collections" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grants_resource_idx" ON "grants" USING btree ("resource","resource_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "share_links_asset_idx" ON "share_links" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "share_links_collection_idx" ON "share_links" USING btree ("collection_id");