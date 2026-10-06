ALTER TABLE "api_keys" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "refresh_hash" text;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "refresh_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "client_id" text;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN "grant_types" jsonb;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN "used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_client_id_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_refresh_hash_idx" ON "api_keys" USING btree ("refresh_hash");--> statement-breakpoint
-- Agents connected before tokens expired keep working for 30 days, then connect again; their clients are kept as if used now (lib/core/oauth.ts).
UPDATE "api_keys" SET "expires_at" = now() + interval '30 days' WHERE "user_id" IS NOT NULL;--> statement-breakpoint
UPDATE "oauth_clients" SET "used_at" = now();
