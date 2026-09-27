ALTER TABLE "assets" ADD COLUMN "private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN "private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "grants" ADD COLUMN "limits" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "limits" jsonb DEFAULT '[]'::jsonb NOT NULL;