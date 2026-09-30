import { and, asc, desc, eq, gte, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, brands, eventCounts, events, pageViews, portals, traffic } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { AssetError } from "@/lib/core/errors";
import { fillWeeks, INSIGHT_DAYS, taken, WEEKS, type Surface } from "@/lib/insights";
import { can, needs } from "@/lib/permissions";
import { hasPreview } from "@/lib/preview";

/**
 * Insights (PRD section 11): what the events lib/core/events.ts records say,
 * for the people who look after the workspace. Every chart reads the
 * event_counts view, so the rollup and today's raw events read as one.
 */

const since = (days: number) => sql`(now() at time zone 'utc')::date - ${days - 1}::int`;
const week = sql<string>`date_trunc('week', ${eventCounts.day})::date::text`;
const n = (filter?: ReturnType<typeof sql>) => sql<number>`coalesce(sum(${eventCounts.count})${filter ? sql` filter (where ${filter})` : sql``}, 0)::int`;

/**
 * The north star (PRD section 20): every time someone got an answer from the
 * brand. A file served, a hub listing read, a use checked (a refusal naming
 * the replacement is an answer too), a search that found something.
 */
const answered = or(
  inArray(eventCounts.kind, ["fetch", "pull", "check"]),
  and(eq(eventCounts.kind, "search"), eq(eventCounts.verdict, "found")),
);

/** How a list names an asset: enough to show and link it. */
async function describe(ids: string[]) {
  const rows = ids.length
    ? await db
        .select({ id: assets.id, filename: assets.filename, title: sql<string | null>`${assets.metadata} ->> 'title'`, mime: assets.mime, version: assets.version, supersededBy: assets.supersededBy })
        .from(assets)
        .where(inArray(assets.id, [...new Set(ids)]))
    : [];
  return new Map(rows.map((a) => [a.id, { id: a.id, title: a.title ?? a.filename, version: a.version, preview: hasPreview(a), supersededBy: a.supersededBy }]));
}

/**
 * The use-check log (PRD section 11): refusals by reason, and the latest
 * ones with what was offered instead and whether it was taken. The log reads
 * raw events, so it goes back EVENT_DAYS at most; the counts read the rollup.
 */
async function checkLog(ws: string) {
  const recent = and(eq(eventCounts.workspaceId, ws), gte(eventCounts.day, sql`${since(INSIGHT_DAYS)}`), eq(eventCounts.kind, "check"));
  const code = sql<string>`unnest(${eventCounts.reasons})`;
  const [[totals], reasons, refusals] = await Promise.all([
    db.select({ allowed: n(sql`verdict = 'allowed'`), refused: n(sql`verdict = 'refused'`) }).from(eventCounts).where(recent),
    db
      .select({ code: sql<string>`r.code`, count: sql<number>`sum(r.count)::int` })
      .from(db.select({ code: code.as("code"), count: eventCounts.count }).from(eventCounts).where(and(recent, eq(eventCounts.verdict, "refused"))).as("r"))
      .groupBy(sql`r.code`)
      .orderBy(desc(sql`sum(r.count)`)),
    db
      .select({ id: events.id, at: events.at, asset: events.assetId, surface: events.surface, client: events.client, context: events.subject, reasons: events.reasons, offered: events.offered })
      .from(events)
      .where(and(eq(events.workspaceId, ws), eq(events.kind, "check"), eq(events.verdict, "refused"), gte(events.day, sql`${since(INSIGHT_DAYS)}`)))
      .orderBy(desc(events.at))
      .limit(50),
  ]);
  const offered = [...new Set(refusals.flatMap((r) => r.offered ?? []))];
  // What was done with the offers since the oldest refusal listed: fetched, or checked and allowed.
  const uses = offered.length
    ? await db
        .select({ asset: sql<string>`${events.assetId}`, client: events.client, at: events.at })
        .from(events)
        .where(
          and(
            eq(events.workspaceId, ws),
            inArray(events.assetId, offered),
            gte(events.at, refusals.at(-1)!.at),
            or(eq(events.kind, "fetch"), and(eq(events.kind, "check"), eq(events.verdict, "allowed"))),
          ),
        )
    : [];
  const described = await describe([...refusals.flatMap((r) => (r.asset ? [r.asset] : [])), ...offered]);
  return {
    ...totals,
    reasons,
    log: refusals.flatMap((r) => {
      const a = r.asset && described.get(r.asset);
      return a
        ? [
            {
              id: r.id,
              at: r.at.toISOString(),
              asset: a,
              surface: r.surface,
              client: r.client,
              context: r.context,
              reasons: r.reasons ?? [],
              offered: (r.offered ?? []).flatMap((id) => {
                const o = described.get(id);
                return o ? [{ asset: o, taken: taken(r, id, uses) }] : [];
              }),
            },
          ]
        : [];
    }),
  };
}

/** GET /api/v1/insights: the workspace's Insights. Write on the workspace. */
export async function insightsOf(caller: Caller) {
  if (!can(caller, "insights.read")) throw new AssetError("forbidden", `Insights take ${needs("insights.read")}`);
  const ws = eq(eventCounts.workspaceId, caller.workspace.id);
  const recent = and(ws, gte(eventCounts.day, sql`${since(INSIGHT_DAYS)}`));
  const fetched = eq(eventCounts.kind, "fetch");

  const [answers, adoption, stale, top, gaps, delivery, views, checks] = await Promise.all([
    db
      .select({ week, person: n(sql`actor = 'person'`), agent: n(sql`actor = 'agent'`), anonymous: n(sql`actor = 'anonymous'`) })
      .from(eventCounts)
      .where(and(ws, gte(eventCounts.day, sql`${since(WEEKS * 7)}`), answered))
      .groupBy(week),
    db
      .select({ week, current: n(sql`verdict = 'current'`), superseded: n(sql`verdict = 'superseded'`) })
      .from(eventCounts)
      .where(and(ws, gte(eventCounts.day, sql`${since(WEEKS * 7)}`), fetched))
      .groupBy(week),
    // Who still loads a version that was already replaced when they got it: the release that hasn't reached them.
    db
      .select({ asset: eventCounts.assetId, referrer: eventCounts.referrer, fetches: n(), last: sql<string>`max(${eventCounts.day})::text` })
      .from(eventCounts)
      .where(and(recent, fetched, eq(eventCounts.verdict, "superseded"), isNotNull(eventCounts.assetId)))
      .groupBy(eventCounts.assetId, eventCounts.referrer)
      .orderBy(desc(n()))
      .limit(50),
    db
      .select({ asset: eventCounts.assetId, surface: eventCounts.surface, fetches: n() })
      .from(eventCounts)
      .where(and(recent, fetched, isNotNull(eventCounts.assetId)))
      .groupBy(eventCounts.assetId, eventCounts.surface),
    db
      .select({ q: eventCounts.subject, searches: n(), last: sql<string>`max(${eventCounts.day})::text` })
      .from(eventCounts)
      .where(and(recent, eq(eventCounts.kind, "search"), eq(eventCounts.verdict, "empty")))
      .groupBy(eventCounts.subject)
      .orderBy(desc(n()))
      .limit(20),
    // Delivery traffic and portal page views, the counters these charts had before Insights (lib/core/usage.ts).
    db
      .select({ day: traffic.day, requests: traffic.requests, bytes: traffic.bytes })
      .from(traffic)
      .where(and(eq(traffic.workspaceId, caller.workspace.id), gte(traffic.day, sql`${since(INSIGHT_DAYS)}`)))
      .orderBy(asc(traffic.day)),
    db
      .select({
        portal: { id: portals.id, name: portals.name },
        brand: { slug: brands.slug, name: brands.name },
        page: pageViews.page,
        views: sql<number>`sum(${pageViews.views})::int`,
      })
      .from(pageViews)
      .innerJoin(portals, eq(portals.id, pageViews.portalId))
      .innerJoin(brands, eq(brands.id, pageViews.brandId))
      .where(and(eq(portals.workspaceId, caller.workspace.id), gte(pageViews.day, sql`${since(INSIGHT_DAYS)}`)))
      .groupBy(portals.id, brands.id, pageViews.page)
      .orderBy(desc(sql`sum(${pageViews.views})`), asc(portals.name), asc(pageViews.page))
      .limit(50),
    checkLog(caller.workspace.id),
  ]);

  // Top assets: summed over surfaces here, the ten most fetched kept.
  const bySurface = new Map<string, Partial<Record<Surface, number>>>();
  for (const r of top) bySurface.set(r.asset!, { ...bySurface.get(r.asset!), [r.surface]: r.fetches });
  const ranked = [...bySurface]
    .map(([id, surfaces]) => ({ id, surfaces, total: Object.values(surfaces).reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const described = await describe([...ranked.map((r) => r.id), ...stale.map((s) => s.asset!)]);
  const replacements = await describe(stale.flatMap((s) => described.get(s.asset!)?.supersededBy ?? []));

  return {
    days: INSIGHT_DAYS,
    weeks: WEEKS,
    answers: fillWeeks(answers, { person: 0, agent: 0, anonymous: 0 }),
    adoption: fillWeeks(adoption, { current: 0, superseded: 0 }),
    stale: stale.flatMap((s) => {
      const a = described.get(s.asset!);
      return a ? [{ asset: a, replacement: (a.supersededBy && replacements.get(a.supersededBy)) || null, referrer: s.referrer, fetches: s.fetches, last: s.last }] : [];
    }),
    top: ranked.flatMap((r) => {
      const a = described.get(r.id);
      return a ? [{ asset: a, total: r.total, surfaces: r.surfaces }] : [];
    }),
    gaps: gaps.map((g) => ({ q: g.q ?? "", searches: g.searches, last: g.last })),
    checks,
    delivery,
    pageViews: views,
  };
}
