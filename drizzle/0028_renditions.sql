CREATE TABLE "renditions" (
	"key" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"bytes" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "renditions" ADD CONSTRAINT "renditions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;