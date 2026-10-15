import { and, asc, desc, eq, gte, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiKeys, assets, brandPages, brands, brandVersions, eventCounts, events, insightNotices, pageViews, portals, shareLinks, traffic, users } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { getAsset, type Asset } from "@/lib/core/assets";
import { recordAudit } from "@/lib/core/audit";
import { listRules } from "@/lib/core/brand";
import { resolveBrand } from "@/lib/core/brands";
import { appUrlFor, hostTarget, portalNamed } from "@/lib/core/domains";
import { sendAs, staleVersionEmail } from "@/lib/core/mail";
import { adminsOf, publicPortalsShowing } from "@/lib/core/portals";
import { checkFeature } from "@/lib/core/usage";
import { latestVersion } from "@/lib/core/versions";
import { AssetError } from "@/lib/core/errors";
import { adoptionDays, connectionsOf, fillWeeks, INSIGHT_DAYS, onCurrent, releaseOfAssets, taken, WEEKS, type Surface } from "@/lib/insights";
import { can, needs } from "@/lib/permissions";
import { hasPreview } from "@/lib/preview";

/**
 * Insights (PRD section 11): what the events lib/core/events.ts records say,
 * for the people who look after the project. Every chart reads the
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
export async function describe(ids: string[]) {
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
  const recent = and(eq(eventCounts.projectId, ws), gte(eventCounts.day, sql`${since(INSIGHT_DAYS)}`), eq(eventCounts.kind, "check"));
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
      .where(and(eq(events.projectId, ws), eq(events.kind, "check"), eq(events.verdict, "refused"), gte(events.day, sql`${since(INSIGHT_DAYS)}`)))
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
            eq(events.projectId, ws),
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

/**
 * Where a replaced version is still loaded, as a notice names it: the
 * referrer's host, else the agent's key name. Null: nobody to tell (a person
 * in the app, a signed link without a referrer).
 */
const placeOf = (s: Place) => s.referrer ?? s.client;
type Place = { referrer: string | null; client: string | null };

/**
 * Who answers for a place still loading a replaced version, as far as this
 * server knows: a site or portal of this project, its admins (as a site's
 * problems go to them); an agent, the person who connected it. Empty for a
 * site elsewhere or a key an admin made: whoever notifies names them.
 */
async function ownersOf(projectId: string, p: Place): Promise<string[]> {
  if (p.referrer) {
    const t = await hostTarget(p.referrer);
    const site = t?.portal ? await portalNamed(t.portal) : null;
    return site?.p.projectId === projectId ? adminsOf(site.p) : [];
  }
  if (!p.client) return [];
  const rows = await db
    .selectDistinct({ email: users.email })
    .from(apiKeys)
    .innerJoin(users, eq(users.id, apiKeys.userId))
    .where(and(eq(apiKeys.projectId, projectId), eq(apiKeys.name, p.client)));
  return rows.map((r) => r.email);
}

/**
 * Search gaps already asked for: an upload link (lib/core/shares.ts) named
 * after the words, still open, the newest. "Request it" on a gap makes one,
 * so what comes back waits in Review like any upload.
 */
async function requestsFor(projectId: string, qs: string[]) {
  const rows = qs.length
    ? await db
        .select({ q: sql<string>`lower(${shareLinks.name})`, at: shareLinks.createdAt, by: shareLinks.createdBy })
        .from(shareLinks)
        .where(
          and(
            eq(shareLinks.projectId, projectId),
            eq(shareLinks.kind, "upload"),
            inArray(sql`lower(${shareLinks.name})`, qs),
            or(sql`${shareLinks.expiresAt} is null`, sql`${shareLinks.expiresAt} > now()`),
          ),
        )
        .orderBy(asc(shareLinks.createdAt))
    : [];
  return new Map(rows.map((r) => [r.q, { at: r.at.toISOString(), by: r.by }]));
}

/**
 * POST /api/v1/insights/notices: tell a place that still loads replaced
 * versions where the current ones are, by email: whoever answers for it
 * (ownersOf) and anyone named. One email names every version given; each
 * version and place is told once, so a second Notify for them is a conflict.
 * Insights' readers, as it acts on what Insights shows, where the plan has Fixes.
 */
export async function notifyStale(caller: Caller, input: { referrer?: string; client?: string; assets: string[]; emails?: string[] }) {
  if (!can(caller, "insights.read")) throw new AssetError("forbidden", `Notifying takes ${needs("insights.read")}`);
  // Notify is Fixes' (lib/limits.ts `fixes`), wherever it is asked from.
  await checkFeature(caller.project.organizationId, "fixes");
  const where: Place = { referrer: input.referrer?.toLowerCase() ?? null, client: input.referrer ? null : (input.client ?? null) };
  const place = placeOf(where);
  if (!place) throw new AssetError("invalid", "Name the place: a referrer's host, or an agent's key name");
  const title = (a: Asset) => a.metadata?.title ?? a.filename;
  const old: { a: Asset; now: Asset }[] = [];
  for (const id of new Set(input.assets)) {
    const a = await getAsset(caller, id);
    if (!a) throw new AssetError("not_found", `No asset ${id}`);
    const now = await latestVersion(a);
    if (now.id === a.id) throw new AssetError("invalid", `${title(a)} is the current version: nothing to tell`);
    old.push({ a, now });
  }
  const to = [...new Set([...(await ownersOf(caller.project.id, where)), ...(input.emails ?? [])].map((e) => e.trim().toLowerCase()))];
  if (!to.length) throw new AssetError("invalid", `Nobody here answers for ${place}: give the email of whoever does`);
  // Claimed before sending, so two clicks at once send one email; given back when none could go.
  const claimed = await db
    .insert(insightNotices)
    .values(old.map((o) => ({ projectId: caller.project.id, assetId: o.a.id, place, by: caller.actor })))
    .onConflictDoNothing()
    .returning();
  if (!claimed.length) throw new AssetError("conflict", `${place} was already told about ${old.length === 1 ? "this version" : "these versions"}`);
  const app = await appUrlFor(caller.project.organizationId);
  const draft = (email: string) =>
    staleVersionEmail(email, {
      by: caller.actor,
      organization: caller.project.organization.name,
      place,
      agent: !where.referrer,
      assets: old
        .filter((o) => claimed.some((c) => c.assetId === o.a.id))
        .map((o) => ({ title: title(o.a), version: o.a.version, current: { title: title(o.now), version: o.now.version, url: `${app}/c/${o.now.id}` } })),
    });
  let sent = 0;
  let error: { message: string; limited?: true } | null = null;
  for (const email of to) {
    const r = await sendAs(caller.project.organizationId, draft(email));
    if (r.sent) sent++;
    else error ??= { message: r.error ?? "it didn't go through", limited: r.limited };
  }
  if (!sent) {
    await db.delete(insightNotices).where(inArray(insightNotices.id, claimed.map((c) => c.id)));
    throw new AssetError(error?.limited ? "rate_limited" : "invalid", `Not sent: ${error?.message}`);
  }
  await recordAudit(caller, "insights.notified", place, { assets: claimed.map((c) => c.assetId), to: to.length, sent });
  return { emailed: sent, notified: claimed.map((c) => ({ asset: c.assetId, at: c.at.toISOString(), by: c.by })) };
}

/**
 * Who still loads a version that was already replaced when they got it, the
 * release that hasn't reached them, over INSIGHT_DAYS: by place, most first,
 * each with its replacement, how many people answer for the place
 * (ownersOf) and when it was told (notifyStale). Insights' Old versions and
 * Fixes read it. Without `owners`, nobody is looked up and each says 0: for
 * a count, which never reads them.
 */
export async function staleIn(projectId: string, { owners: withOwners = true } = {}) {
  const stale = await db
    .select({
      asset: eventCounts.assetId,
      referrer: eventCounts.referrer,
      client: eventCounts.client,
      fetches: n(),
      first: sql<string>`min(${eventCounts.day})::text`,
      last: sql<string>`max(${eventCounts.day})::text`,
    })
    .from(eventCounts)
    .where(
      and(
        eq(eventCounts.projectId, projectId),
        gte(eventCounts.day, sql`${since(INSIGHT_DAYS)}`),
        eq(eventCounts.kind, "fetch"),
        eq(eventCounts.verdict, "superseded"),
        isNotNull(eventCounts.assetId),
      ),
    )
    .groupBy(eventCounts.assetId, eventCounts.referrer, eventCounts.client)
    .orderBy(desc(n()))
    .limit(50);
  const described = await describe(stale.map((s) => s.asset!));
  const [replacements, told, owners] = await Promise.all([
    describe(stale.flatMap((s) => described.get(s.asset!)?.supersededBy ?? [])),
    stale.length
      ? db
          .select({ asset: insightNotices.assetId, place: insightNotices.place, at: insightNotices.at, by: insightNotices.by })
          .from(insightNotices)
          .where(inArray(insightNotices.assetId, [...new Set(stale.map((s) => s.asset!))]))
      : [],
    // Each place's people, counted: who a Notify reaches without being told (ownersOf).
    Promise.all([...new Map(withOwners ? stale.flatMap((s) => (placeOf(s) ? [[placeOf(s)!, s] as const] : [])) : [])].map(async ([p, s]) => [p, (await ownersOf(projectId, s)).length] as const)).then(
      (xs) => new Map<string | null, number>(xs),
    ),
  ]);
  return stale.flatMap((s) => {
    const a = described.get(s.asset!);
    const place = placeOf(s);
    const notice = told.find((t) => t.asset === s.asset && t.place === place);
    return a
      ? [
          {
            asset: a,
            replacement: (a.supersededBy && replacements.get(a.supersededBy)) || null,
            referrer: s.referrer,
            client: s.client,
            fetches: s.fetches,
            first: s.first,
            last: s.last,
            owners: owners.get(place) ?? 0,
            notified: notice ? { at: notice.at.toISOString(), by: notice.by } : null,
          },
        ]
      : [];
  });
}

/** Searches that found nothing over INSIGHT_DAYS, most asked first, each with the upload link that asks for it (requestsFor). Insights' Not found and Fixes read it. */
export async function gapsIn(projectId: string) {
  const gaps = await db
    .select({ q: eventCounts.subject, searches: n(), first: sql<string>`min(${eventCounts.day})::text`, last: sql<string>`max(${eventCounts.day})::text` })
    .from(eventCounts)
    .where(and(eq(eventCounts.projectId, projectId), gte(eventCounts.day, sql`${since(INSIGHT_DAYS)}`), eq(eventCounts.kind, "search"), eq(eventCounts.verdict, "empty")))
    .groupBy(eventCounts.subject)
    .orderBy(desc(n()))
    .limit(20);
  const requested = await requestsFor(projectId, gaps.flatMap((g) => g.q ?? []));
  return gaps.map((g) => ({ q: g.q ?? "", searches: g.searches, first: g.first, last: g.last, requested: requested.get(g.q ?? "") ?? null }));
}

/** GET /api/v1/insights: the project's Insights. Write on the project. */
export async function insightsOf(caller: Caller) {
  if (!can(caller, "insights.read")) throw new AssetError("forbidden", `Insights take ${needs("insights.read")}`);
  const ws = eq(eventCounts.projectId, caller.project.id);
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
    staleIn(caller.project.id),
    db
      .select({ asset: eventCounts.assetId, surface: eventCounts.surface, fetches: n() })
      .from(eventCounts)
      .where(and(recent, fetched, isNotNull(eventCounts.assetId)))
      .groupBy(eventCounts.assetId, eventCounts.surface),
    gapsIn(caller.project.id),
    // Delivery traffic and portal page views, the counters these charts had before Insights (lib/core/usage.ts).
    db
      .select({ day: traffic.day, requests: traffic.requests, bytes: traffic.bytes })
      .from(traffic)
      .where(and(eq(traffic.projectId, caller.project.id), gte(traffic.day, sql`${since(INSIGHT_DAYS)}`)))
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
      .where(and(eq(portals.projectId, caller.project.id), gte(pageViews.day, sql`${since(INSIGHT_DAYS)}`)))
      .groupBy(portals.id, brands.id, pageViews.page)
      .orderBy(desc(sql`sum(${pageViews.views})`), asc(portals.name), asc(pageViews.page))
      .limit(50),
    checkLog(caller.project.id),
  ]);

  // Top assets: summed over surfaces here, the ten most fetched kept.
  const bySurface = new Map<string, Partial<Record<Surface, number>>>();
  for (const r of top) bySurface.set(r.asset!, { ...bySurface.get(r.asset!), [r.surface]: r.fetches });
  const ranked = [...bySurface]
    .map(([id, surfaces]) => ({ id, surfaces, total: Object.values(surfaces).reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
  const described = await describe(ranked.map((r) => r.id));

  return {
    days: INSIGHT_DAYS,
    weeks: WEEKS,
    answers: fillWeeks(answers, { person: 0, agent: 0, anonymous: 0 }),
    adoption: fillWeeks(adoption, { current: 0, superseded: 0 }),
    stale,
    top: ranked.flatMap((r) => {
      const a = described.get(r.id);
      return a ? [{ asset: a, total: r.total, surfaces: r.surfaces }] : [];
    }),
    gaps,
    checks,
    delivery,
    pageViews: views,
  };
}

/**
 * GET /api/v1/assets/{id}/insights: where one asset is used (PRD INS-5), its
 * brand rules, the brand pages that show it and the public portals, and how
 * it was fetched lately, by surface and by referrer. Null: no such asset for
 * this caller.
 */
export async function assetInsights(caller: Caller, id: string) {
  if (!can(caller, "insights.read")) throw new AssetError("forbidden", `Insights take ${needs("insights.read")}`);
  const asset = await getAsset(caller, id);
  if (!asset) return null;
  const ws = caller.project.id;
  const mine = and(eq(eventCounts.projectId, ws), eq(eventCounts.assetId, id), eq(eventCounts.kind, "fetch"), gte(eventCounts.day, sql`${since(INSIGHT_DAYS)}`));
  const [rules, pages, shownOn, surfaces, referrers] = await Promise.all([
    listRules(ws, { asset: id }),
    // ponytail: reads every page's sections as text; an index of what pages show once projects have thousands.
    db
      .select({ brand: { slug: brands.slug, name: brands.name, default: brands.isDefault }, slug: brandPages.slug, title: brandPages.title })
      .from(brandPages)
      .innerJoin(brands, eq(brands.id, brandPages.brandId))
      .where(and(eq(brands.projectId, ws), or(eq(brandPages.cover, id), sql`${brandPages.sections}::text like ${`%${id}%`}`)))
      .orderBy(asc(brands.name), asc(brandPages.position)),
    publicPortalsShowing(ws, id),
    db.select({ surface: eventCounts.surface, fetches: n() }).from(eventCounts).where(mine).groupBy(eventCounts.surface),
    db
      .select({ host: eventCounts.referrer, fetches: n(), last: sql<string>`max(${eventCounts.day})::text` })
      .from(eventCounts)
      .where(and(mine, isNotNull(eventCounts.referrer)))
      .groupBy(eventCounts.referrer)
      .orderBy(desc(n()))
      .limit(10),
  ]);
  return {
    days: INSIGHT_DAYS,
    rules: rules.map(({ brand, key, label, context }) => ({ brand: brand!, key, label, context })),
    pages,
    portals: shownOn.map(({ name, url }) => ({ name, url })),
    fetches: { total: surfaces.reduce((t, s) => t + s.fetches, 0), surfaces: Object.fromEntries(surfaces.map((s) => [s.surface, s.fetches])) as Partial<Record<Surface, number>> },
    referrers: referrers.map((r) => ({ host: r.host!, fetches: r.fetches, last: r.last })),
  };
}

/** How many releases back a brand's files are read from: older ones hold files nobody should still load, and would weigh on every read. */
const RELEASES = 20;
/** The week a brand's Insights counts its answers over, and the places still on an older release. */
const WEEK = 7;

/**
 * GET /api/v1/brands/{slug}/insights: the brand's own signals, on its
 * Overview and its Insights tab. BrandHub reads of its files (pulls) and
 * portal page views of its pages over the last 30 days name the brand. A
 * fetch or a check names a file, so the brand's are its files: the ones its
 * rules held in its last RELEASES releases, each belonging to the newest
 * release holding it (lib/insights.ts releaseOfAssets). From them: this
 * week's answers (files served, uses checked, hub files read), how many
 * agents asked, and uses refused; and release adoption, the fetches since
 * the latest release a day each, on it or on an older one, with where the
 * older ones still go this week.
 */
export async function brandInsights(caller: Caller, slug: string) {
  if (!can(caller, "insights.read")) throw new AssetError("forbidden", `Insights take ${needs("insights.read")}`);
  const ws = caller.project.id;
  const b = await resolveBrand(ws, slug);
  const [[pulls], [views], released] = await Promise.all([
    db
      .select({ total: n() })
      .from(eventCounts)
      .where(and(eq(eventCounts.projectId, ws), eq(eventCounts.brandId, b.id), eq(eventCounts.kind, "pull"), gte(eventCounts.day, sql`${since(INSIGHT_DAYS)}`))),
    db
      .select({ total: sql<number>`coalesce(sum(${pageViews.views}), 0)::int` })
      .from(pageViews)
      .where(and(eq(pageViews.brandId, b.id), gte(pageViews.day, sql`${since(INSIGHT_DAYS)}`))),
    db
      .select({ number: brandVersions.number, publishedAt: brandVersions.publishedAt, rules: brandVersions.snapshot })
      .from(brandVersions)
      .where(and(eq(brandVersions.brandId, b.id), isNotNull(brandVersions.publishedAt)))
      .orderBy(desc(brandVersions.number))
      .limit(RELEASES),
  ]);
  const of = releaseOfAssets(released.map((r) => ({ number: r.number, assets: r.rules.flatMap((x) => x.assets.map((a) => a.id)) })));
  const ids = [...of.keys()];
  const mine = and(eq(eventCounts.projectId, ws), ids.length ? inArray(eventCounts.assetId, ids) : sql`false`);
  const [latest] = released;
  const week = gte(eventCounts.day, sql`${since(WEEK)}`);
  // Since the latest release, but not past the window the charts keep: UTC days, as events have them.
  const utc = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const today = utc(Date.now());
  const floor = utc(Date.now() - (INSIGHT_DAYS - 1) * 86_400_000);
  const from = latest && [utc(latest.publishedAt!.getTime()), floor].sort()[1];
  const [[answers], fetches, places] = await Promise.all([
    db
      .select({ total: n(), agents: n(sql`actor = 'agent'`), refused: n(sql`kind = 'check' and verdict = 'refused'`) })
      .from(eventCounts)
      .where(
        and(
          eq(eventCounts.projectId, ws),
          week,
          or(and(eq(eventCounts.brandId, b.id), eq(eventCounts.kind, "pull")), and(mine, inArray(eventCounts.kind, ["fetch", "check"]))),
        ),
      ),
    latest
      ? db
          .select({ day: sql<string>`${eventCounts.day}::text`, asset: sql<string>`${eventCounts.assetId}`, verdict: eventCounts.verdict, count: n() })
          .from(eventCounts)
          .where(and(mine, eq(eventCounts.kind, "fetch"), gte(eventCounts.day, from!)))
          .groupBy(eventCounts.day, eventCounts.assetId, eventCounts.verdict)
      : [],
    latest
      ? db
          .select({
            asset: sql<string>`${eventCounts.assetId}`,
            verdict: eventCounts.verdict,
            referrer: eventCounts.referrer,
            surface: eventCounts.surface,
            client: eventCounts.client,
            fetches: n(),
            last: sql<string>`max(${eventCounts.day})::text`,
          })
          .from(eventCounts)
          .where(and(mine, eq(eventCounts.kind, "fetch"), week))
          .groupBy(eventCounts.assetId, eventCounts.verdict, eventCounts.referrer, eventCounts.surface, eventCounts.client)
          .orderBy(desc(n()))
      : [],
  ]);
  const older = latest ? places.filter((p) => !onCurrent(of, latest.number, p)).slice(0, 20) : [];
  const described = await describe(older.map((p) => p.asset));
  const days = latest ? adoptionDays(fetches, of, latest.number, from!, today) : [];
  const [on, off] = [days.reduce((t, d) => t + d.current, 0), days.reduce((t, d) => t + d.older, 0)];
  return {
    days: INSIGHT_DAYS,
    pulls: pulls.total,
    views: views.total,
    week: { days: WEEK, answers: answers.total, agents: answers.agents, refused: answers.refused },
    adoption: latest
      ? {
          release: { number: latest.number, publishedAt: latest.publishedAt!.toISOString() },
          days,
          /** The share of fetches since the release on it, 0 to 100; null before any. */
          share: on + off ? Math.round((100 * on) / (on + off)) : null,
          older: older.flatMap((p) => {
            const a = described.get(p.asset);
            return a ? [{ asset: a, release: of.get(p.asset) ?? null, referrer: p.referrer, surface: p.surface, client: p.client, fetches: p.fetches, last: p.last }] : [];
          }),
        }
      : null,
  };
}

/**
 * GET /api/v1/insights/connections: what each agent asked for over the last
 * INSIGHT_DAYS days (lib/insights.ts connectionsOf), on the Connections page.
 * An agent is its key's name, as events keep it. A subject is read only
 * where it names a tool or a context: a search's words stay in Insights.
 */
export async function connections(caller: Caller) {
  if (!can(caller, "insights.read")) throw new AssetError("forbidden", `Insights take ${needs("insights.read")}`);
  const subject = sql<string | null>`case when ${eventCounts.kind} in ('tool', 'check', 'lookup') then ${eventCounts.subject} end`;
  const rows = await db
    .select({ client: sql<string>`${eventCounts.client}`, kind: eventCounts.kind, subject, verdict: eventCounts.verdict, reasons: eventCounts.reasons, count: n() })
    .from(eventCounts)
    .where(
      and(
        eq(eventCounts.projectId, caller.project.id),
        gte(eventCounts.day, sql`${since(INSIGHT_DAYS)}`),
        eq(eventCounts.actor, "agent"),
        isNotNull(eventCounts.client),
      ),
    )
    .groupBy(eventCounts.client, eventCounts.kind, subject, eventCounts.verdict, eventCounts.reasons);
  return { days: INSIGHT_DAYS, clients: connectionsOf(rows) };
}
