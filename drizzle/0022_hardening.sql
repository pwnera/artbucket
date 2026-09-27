CREATE TABLE "traffic" (
	"workspace_id" uuid NOT NULL,
	"day" date NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"bytes" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "traffic_workspace_id_day_pk" PRIMARY KEY("workspace_id","day")
);
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "traffic" ADD CONSTRAINT "traffic_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_sha256_idx" ON "assets" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "assets_deleted_at_idx" ON "assets" USING btree ("deleted_at") WHERE "assets"."deleted_at" is not null;