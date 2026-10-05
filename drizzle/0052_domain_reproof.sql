ALTER TABLE "domains" ADD COLUMN "checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "missing_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_domains" ADD COLUMN "checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_domains" ADD COLUMN "missing_since" timestamp with time zone;