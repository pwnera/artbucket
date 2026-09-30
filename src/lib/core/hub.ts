import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { assets, brands, brandVersions, hubCollections, hubFollows, organizations, portals, workspaces, type Visibility } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { ingestBytes } from "@/lib/core/assets";
import { createBrand } from "@/lib/core/brand";
import { publishedSource } from "@/lib/core/page-view";
import { deliverableSql } from "@/lib/core/assets";
import { guidelinesPortal } from "@/lib/core/brands";
import { portalHome } from "@/lib/core/domains";
import { AssetError } from "@/lib/core/errors";
import { pullCounts } from "@/lib/core/events";
import { proofsOf, publicListing } from "@/lib/core/hub-trust";
import { reader, readBrand } from "@/lib/core/portals";
import { pagePath } from "@/lib/core/signing";
import { env } from "@/lib/env";
import type { SnapRule } from "@/lib/history";
import { readablePages } from "@/lib/page-view";
import { pool } from "@/lib/pool";
import { getObject, originalKey } from "@/lib/storage";
import { cookieDomain, countsOf, hubHome, hubPath, logoOf, parseHubRef, swatches, taglineOf, tintOf } from "@/lib/hub";
import { withSignature } from "@/lib/signed";

/**
 * BrandHub (HUB_URL): every published brand at {org}/{brand}, as its latest
 * publish has it (lib/core/portals.ts readBrand): only assets that may be
 * used, signed for a day. A brand is private (lib/core/brands.ts setHub)
 * until made public: private, only people who may read its workspace see it,
 * signed in, on the app's own host (/hub); public, anyone and any agent,
 * on the hub's own host too. It links a portal as its guidelines.
 *
 * Who has it is its organization; `verified` is what that organization
 * proved it holds, a domain (Settings, Domains) or a GitHub account
 * (lib/core/hub-trust.ts), else a public brand is a community one: anyone
 * may make public a brand of any name, so readers are told, and may report
 * or claim it.
 */

export const hubOn = () => !!env.HUB_URL;

/** The hub's own host, when it has one: HUB_URL's, unless that is APP_URL's (then the hub is only /hub there). */
const ownHost = () => {
  const hub = env.HUB_URL ? new URL(env.HUB_URL).host : null;
  return hub && hub !== new URL(env.APP_URL).host ? hub : null;
};

/**
 * Where the hub's links start, on the host asked: nothing on its own host
 * (src/proxy.ts), /hub on the app's, where people are signed in and see
 * their private brands too.
 */
export async function hubBase() {
  const host = (await headers()).get("host");
  return host && host === ownHost() ? "" : "/hub";
}

/**
 * Who is looking: private brands show to their people. On the app's host
 * always; on the hub's own only when the session cookie reaches it, set for
 * the domain the two share (lib/hub.ts cookieDomain, lib/auth.ts).
 */
export async function hubViewer() {
  const h = await headers();
  return h.get("host") === ownHost() && !cookieDomain(env.APP_URL, env.HUB_URL) ? null : reader(h);
}
export type HubViewer = Awaited<ReturnType<typeof hubViewer>>;

/** A publish of the brand, newest first: its number, when, and its rules. */
const latest = (col: SQL) =>
  sql`(select ${col} from ${brandVersions} v where v.brand_id = ${brands.id} and v.published_at is not null order by v.number desc limit 1)`;

/**
 * Brands BrandHub shows, newest publish first: published, and public, or
 * private to a workspace `viewer` may read. Checked in two steps: SQL keeps
 * the public ones and the viewer's organizations', then each private one's
 * workspace is asked.
 */
async function listings(where: SQL | undefined, limit: number, viewer: HubViewer) {
  // Public, unless the server's operator delisted it (brands.hub_delisted): then its own people see it as private.
  const open = and(eq(brands.visibility, "public"), isNull(brands.hubDelisted));
  const rows = await db
    .select({
      id: brands.id,
      visibility: sql<Visibility>`case when ${brands.hubDelisted} is null then ${brands.visibility} else 'private' end`,
      hubPortalId: brands.hubPortalId,
      org: organizations.slug,
      owner: organizations.name,
      orgId: organizations.id,
      brand: brands.slug,
      name: brands.name,
      workspaceId: brands.workspaceId,
      version: latest(sql`v.number`).mapWith(Number),
      publishedAt: latest(sql`v.published_at`).mapWith((v: string) => new Date(v)),
      snapshot: latest(sql`v.snapshot`).mapWith((v: SnapRule[] | string) => (typeof v === "string" ? (JSON.parse(v) as SnapRule[]) : v)),
    })
    .from(brands)
    .innerJoin(workspaces, eq(workspaces.id, brands.workspaceId))
    .innerJoin(organizations, eq(organizations.id, workspaces.organizationId))
    .where(
      and(
        sql`exists (select 1 from ${brandVersions} v where v.brand_id = ${brands.id} and v.published_at is not null)`,
        viewer?.orgs.length ? or(open, inArray(workspaces.organizationId, viewer.orgs)) : open,
        where,
      ),
    )
    // ponytail: newest publish first, ilike search; a ranking and full-text search once there are thousands.
    .orderBy(desc(latest(sql`v.published_at`)), asc(brands.createdAt))
    .limit(limit);
  const reads = new Map<string, Promise<boolean>>();
  const may = (ws: string) => reads.get(ws) ?? reads.set(ws, viewer!.reads(ws)).get(ws)!;
  const shown = await Promise.all(rows.map(async (r) => r.visibility === "public" || (!!viewer && (await may(r.workspaceId)))));
  return rows.filter((_, i) => shown[i]);
}

type Row = Awaited<ReturnType<typeof listings>>[number];

/** Cards: who listed it, its version, its pulls, its colors and its logo, signed for a day. */
async function cards(rows: Row[]) {
  const ids = [...new Set(rows.flatMap((r) => (r.snapshot ?? []).flatMap((x) => x.assets.map((a) => a.id))))];
  const [usable, verified, pulls] = await Promise.all([
    ids.length
      ? db
          .select({ id: assets.id, mime: assets.mime, workspaceId: assets.workspaceId })
          .from(assets)
          .where(and(inArray(assets.id, ids), deliverableSql))
          .then((xs) => new Map(xs.map((a) => [a.id, a])))
      : new Map<string, { id: string; mime: string; workspaceId: string }>(),
    proofsOf(rows.map((r) => r.orgId)),
    pullCounts(rows.map((r) => r.id)),
  ]);
  return rows.map((r) => {
    const rules = (r.snapshot ?? []).map((x) => ({
      ...x,
      // Only the brand's own files, and only while they may be used, as its portal shows them.
      assets: x.assets.flatMap((a) => {
        const u = usable.get(a.id);
        return u && u.workspaceId === r.workspaceId ? [{ id: a.id, mime: u.mime }] : [];
      }),
    }));
    const logo = logoOf(rules);
    return {
      /** The brand's id: for the viewer's own Following, never listed (index.json leaves it out). */
      id: r.id,
      org: r.org,
      owner: r.owner,
      brand: r.brand,
      name: r.name,
      visibility: r.visibility,
      path: hubPath(r.org, r.brand),
      version: r.version,
      publishedAt: r.publishedAt,
      verified: verified.get(r.orgId) ?? null,
      /** Its BrandHub files read in the last PULL_DAYS days (lib/core/events.ts). */
      pulls: pulls.get(r.id) ?? 0,
      tagline: taglineOf(rules),
      tint: tintOf(rules),
      swatches: swatches(rules),
      ...countsOf(rules),
      logo: logo && pagePath(logo.id, "/h_240,f_webp"),
    };
  });
}

export type HubCard = Awaited<ReturnType<typeof cards>>[number];

export const HUB_SORTS = { trending: "Trending this week", recent: "Recently released", name: "Name" } as const;
export type HubSort = keyof typeof HUB_SORTS;

/** How far back Trending looks: pulls in the last week. */
const TRENDING_DAYS = 7;

/**
 * Listings, newest publish first, by name, or trending (most pulled in the
 * last TRENDING_DAYS, then newest): all of them, one organization's, or
 * those whose name or owner has `q` in it.
 *
 * ponytail: trending ranks the newest `limit` listings, not every one; rank
 * in SQL from a per-brand pull total once the hub outgrows 200 listings.
 */
export async function hubListings({
  q,
  org,
  sort = "recent",
  limit = 60,
  viewer = null,
}: { q?: string | null; org?: string | null; sort?: HubSort; limit?: number; viewer?: HubViewer } = {}) {
  const like = q?.trim() && `%${q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const where = and(
    org ? eq(organizations.slug, org) : undefined,
    like ? or(ilike(brands.name, like), ilike(brands.slug, like), ilike(organizations.name, like), ilike(organizations.slug, like)) : undefined,
  );
  const out = await cards(await listings(where, Math.min(Math.max(limit, 1), 200), viewer));
  if (sort === "name") return out.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  if (sort === "trending") {
    const week = await pullCounts(out.map((c) => c.id), TRENDING_DAYS);
    // Stable: equal weeks keep the newest publish first.
    return out.sort((a, b) => (week.get(b.id) ?? 0) - (week.get(a.id) ?? 0));
  }
  return out;
}

/** The brands someone follows on BrandHub, by id. */
export async function followed(userId: string) {
  const rows = await db.select({ id: hubFollows.brandId }).from(hubFollows).where(eq(hubFollows.userId, userId));
  return new Set(rows.map((r) => r.id));
}

/**
 * Follow a public listing, or stop (PUT and DELETE
 * /api/v1/hub/{org}/{brand}/follow): a person, signed in. Following puts it
 * in their Following tab on the hub.
 */
export async function follow(caller: Caller, org: string, slug: string, on: boolean) {
  if (!caller.user) throw new AssetError("forbidden", "A person follows a brand, signed in: not a key");
  const b = await publicListing(org, slug);
  if (on) await db.insert(hubFollows).values({ userId: caller.user.id, brandId: b.id }).onConflictDoNothing();
  else await db.delete(hubFollows).where(and(eq(hubFollows.userId, caller.user.id), eq(hubFollows.brandId, b.id)));
  return { following: on };
}

/**
 * The server operator's curated collections (hub_collections), in order,
 * each with the cards of `cards` it names, as {org}/{brand}: one that isn't
 * among them (not public, or gone) is left out, and so is a collection left
 * with none.
 */
export async function hubCollectionsOf(shown: HubCard[]) {
  const rows = await db.select().from(hubCollections).orderBy(asc(hubCollections.position), asc(hubCollections.title));
  const by = new Map(shown.filter((c) => c.visibility === "public").map((c) => [`${c.org}/${c.brand}`, c]));
  return rows
    .map((r) => ({ slug: r.slug, title: r.title, description: r.description, cards: r.brands.flatMap((ref) => by.get(ref.toLowerCase()) ?? []) }))
    .filter((c) => c.cards.length);
}

/** An organization, as its hub page names it, when it lists anything. */
export async function hubOwner(org: string) {
  const [o] = await db.select({ id: organizations.id, slug: organizations.slug, name: organizations.name }).from(organizations).where(eq(organizations.slug, org));
  if (!o) return null;
  return { slug: o.slug, name: o.name, verified: (await proofsOf([o.id])).get(o.id) ?? null };
}

/**
 * One brand, as its latest publish has it or as the publish `version` names:
 * who has it, its rules signed for a day, every version published, the portal
 * people read its guidelines on, and the terms they accept there. Null when
 * nothing `viewer` may see is at `{org}/{slug}`, or that version was never
 * published. With `context`, the rules resolved for it (lib/rules.ts resolve).
 * With `workspace`, only that workspace's brand by the slug (the Overview's).
 */
export async function hubBrand(
  org: string,
  slug: string,
  { version, context, viewer = null, workspace }: { version?: number; context?: string | null; viewer?: HubViewer; workspace?: string } = {},
) {
  // Two of an organization's workspaces may each have one by this slug: the public one first (setHub allows one), else the older.
  const found = await listings(and(eq(organizations.slug, org), eq(brands.slug, slug), workspace ? eq(brands.workspaceId, workspace) : undefined), 5, viewer);
  const row = found.find((r) => r.visibility === "public") ?? found[0];
  if (!row) return null;
  const view = await readBrand(row.workspaceId, { id: row.id, slug: row.brand, name: row.name }, null, { version, context }).catch((err) => {
    if (err instanceof AssetError && err.code === "not_found") return null;
    throw err;
  });
  if (!view?.version) return null;
  const door = await guidelinesPortal(row);
  const [[card], versions, home, [site], [follows]] = await Promise.all([
    cards([row]),
    db
      .select({ number: brandVersions.number, name: brandVersions.name, publishedAt: brandVersions.publishedAt })
      .from(brandVersions)
      .where(and(eq(brandVersions.brandId, row.id), isNotNull(brandVersions.publishedAt)))
      .orderBy(desc(brandVersions.number)),
    door && portalHome(door.slug),
    door ? db.select({ terms: sql<string | null>`${portals.site} ->> 'terms'` }).from(portals).where(eq(portals.id, door.id)) : [],
    db.select({ n: sql<number>`count(*)::int` }).from(hubFollows).where(eq(hubFollows.brandId, row.id)),
  ]);
  const fileUrl = (a: { id: string; rendition: string | null }) =>
    withSignature(`${env.APP_URL}/a/${a.id}${a.rendition ? `/${a.rendition}` : ""}`, view.signed[a.id]);
  const rules = view.data.map((r) => ({
    key: r.key,
    label: r.label,
    context: r.context,
    type: r.type,
    value: r.value,
    spec: r.spec,
    usage: r.usage,
    assets: r.assets.map((a) => ({ ...a, url: fileUrl(a) })),
  }));
  const path = hubPath(row.org, row.brand, version);
  return {
    ...card,
    /** Whose it is, for Insights' count of reads; never shown. */
    brandId: row.id,
    workspaceId: row.workspaceId,
    version: view.version.number,
    publishedAt: view.version.publishedAt,
    latest: row.version,
    versions: versions.map((v) => ({ number: v.number, name: v.name, publishedAt: v.publishedAt! })),
    /** How many people follow it on the hub: the Follow button's count. */
    followers: follows?.n ?? 0,
    url: hubHome(row.visibility, env.APP_URL, env.HUB_URL!) + path,
    guidelines: home?.url ?? null,
    terms: site?.terms ?? null,
    contexts: view.contexts,
    rules,
    /** Each file's signature, for URLs made from its id (lib/signed.ts signUrlsIn). */
    signed: view.signed,
  };
}

export type HubBrand = NonNullable<Awaited<ReturnType<typeof hubBrand>>>;

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
/** The most files a start copies: a brand's logos, faces and imagery, not its whole library. */
const START_FILES = 200;

/**
 * "Start from this brand" (create_brand with `from: "rust-lang/rust@12"`,
 * POST /api/v1/brands): a new brand in the caller's workspace from a public
 * BrandHub brand's release (its latest without @n), as Duplicate does
 * within a workspace. It takes what that release shows anyone: its rules,
 * its theme, the pages and sections everyone may read (none hidden or for
 * partners or members), and the files they use that may be delivered,
 * copied into this library (same bytes, stored once). The brand keeps where
 * it came from (`from`). A file that isn't copied is left out of its rules.
 */
export async function startFrom(caller: Caller, input: { name: string; slug?: string; from: string }) {
  if (!hubOn()) throw new AssetError("invalid", "from: this server has no BrandHub to start from");
  const ref = parseHubRef(input.from);
  // Public only, whoever asks: a private brand is its own workspace's to duplicate.
  const hub = ref && (await hubBrand(ref.org, ref.slug, { version: ref.version }));
  if (!hub || hub.visibility !== "public") throw new AssetError("invalid", `from: nothing public is listed at ${input.from}`);
  const src = await publishedSource(hub.workspaceId, hub.brand, hub.version);
  if (!src?.version) throw new AssetError("invalid", `from: ${input.from} has no release to start from`);
  const pages = src.pages?.length ? readablePages(src, { level: "everyone" }) : [];
  const text = JSON.stringify({ rules: src.rules, pages, theme: src.theme });
  const own = src.rules.flatMap((r) => r.assets.map((a) => a.id));
  const ids = [...new Set([...own, ...(text.match(UUID) ?? []).map((x) => x.toLowerCase())])];
  const files = ids.length
    ? (
        await db
          .select({ id: assets.id, sha256: assets.sha256, mime: assets.mime, filename: assets.filename, rights: assets.rights })
          .from(assets)
          .where(
            and(
              inArray(assets.id, ids),
              eq(assets.workspaceId, hub.workspaceId),
              deliverableSql,
              // A private file only when a rule holds it: the hub shows those to anyone already.
              own.length ? or(eq(assets.private, false), inArray(assets.id, own)) : eq(assets.private, false),
            ),
          )
      ).slice(0, START_FILES)
    : [];
  const copied = new Map<string, string>();
  await pool(files, 4, async (a) => {
    const bytes = await getObject(originalKey(a.sha256));
    const made = await ingestBytes(caller, { bytes, mime: a.mime, filename: a.filename, rights: a.rights, tags: [ref!.slug], via: "import" });
    copied.set(a.id, made.asset.id);
  });
  const seed = JSON.parse(text.replace(UUID, (id) => copied.get(id.toLowerCase()) ?? id)) as { rules: typeof src.rules; pages: typeof pages; theme: typeof src.theme };
  const made = await createBrand(caller, { name: input.name, slug: input.slug }, { ...seed, forkedFrom: `${hub.org}/${hub.brand}@${hub.version}` });
  return made;
}
