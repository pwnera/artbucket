ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_hash_unique";--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_hash_workspace_unique" UNIQUE("hash","workspace_id");