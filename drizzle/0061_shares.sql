ALTER TABLE "grants" DROP CONSTRAINT "grants_holder_check";--> statement-breakpoint
ALTER TABLE "grants" ADD COLUMN "holder_project_id" uuid;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_holder_project_id_workspaces_id_fk" FOREIGN KEY ("holder_project_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_project_resource_unique" UNIQUE("holder_project_id","resource","resource_id");--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_share_check" CHECK ("grants"."holder_project_id" is null or ("grants"."scope" = 'read' and "grants"."resource" in ('brand', 'collection', 'asset')));--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_holder_check" CHECK (num_nonnulls("grants"."user_id", "grants"."group_id", "grants"."holder_project_id") = 1);