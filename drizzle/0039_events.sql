CREATE TABLE "event_days" (
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid,
	"day" date NOT NULL,
	"kind" text NOT NULL,
	"surface" text NOT NULL,
	"actor" text NOT NULL,
	"client" text,
	"asset_id" uuid,
	"subject" text,
	"version" integer,
	"verdict" text,
	"reasons" text[],
	"referrer" text,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid,
	"kind" text NOT NULL,
	"surface" text NOT NULL,
	"actor" text NOT NULL,
	"client" text,
	"asset_id" uuid,
	"subject" text,
	"version" integer,
	"verdict" text,
	"reasons" text[],
	"offered" uuid[],
	"referrer" text,
	"day" date DEFAULT (now() at time zone 'utc')::date NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_kind_check" CHECK ("events"."kind" in ('fetch', 'check', 'search', 'view', 'pull', 'lookup')),
	CONSTRAINT "events_actor_check" CHECK ("events"."actor" in ('person', 'agent', 'anonymous'))
);
--> statement-breakpoint
ALTER TABLE "event_days" ADD CONSTRAINT "event_days_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_days" ADD CONSTRAINT "event_days_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_days" ADD CONSTRAINT "event_days_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_days_workspace_day_idx" ON "event_days" USING btree ("workspace_id","day");--> statement-breakpoint
CREATE INDEX "event_days_asset_idx" ON "event_days" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "event_days_day_idx" ON "event_days" USING btree ("day");--> statement-breakpoint
CREATE INDEX "events_workspace_day_idx" ON "events" USING btree ("workspace_id","day");--> statement-breakpoint
CREATE INDEX "events_asset_idx" ON "events" USING btree ("asset_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE VIEW "public"."event_counts" AS (select workspace_id, brand_id, day, kind, surface, actor, client, asset_id, subject, version, verdict, reasons, referrer, count from "event_days"
    union all
    select workspace_id, brand_id, day, kind, surface, actor, client, asset_id, subject, version, verdict, reasons, referrer, count(*)::int from "events"
    where day > coalesce((select max(day) from "event_days"), '-infinity'::date)
    group by workspace_id, brand_id, day, kind, surface, actor, client, asset_id, subject, version, verdict, reasons, referrer);