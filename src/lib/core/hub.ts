import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { assets, brands, brandVersions, organizations, portals, workspaces, type Visibility } from "@/lib/db/schema";
import { deliverableSql } from "@/lib/core/assets";
import { guidelinesPortal } from "@/lib/core/brands";
import { portalHome } from "@/lib/core/domains";
import { AssetError } from "@/lib/core/errors";
import { pullCounts } from "@/lib/core/events";
import { proofsOf } from "@/lib/core/hub-trust";
import { reader, readBrand } from "@/lib/core/portals";
import { pagePath } from "@/lib/core/signing";
import { env } from "@/lib/env";
import type { SnapRule } from "@/lib/history";
import { cookieDomain, countsOf, hubHome, hubPath, logoOf, swatches, taglineOf, tintOf } from "@/lib/hub";
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

export const HUB_SORTS = { recent: "Recently released", name: "Name" } as const;
export type HubSort = keyof typeof HUB_SORTS;

/**
 * Listings, newest publish first or by name: all of them, one
 * organization's, or those whose name or owner has `q` in it.
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
  return sort === "name" ? out.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" })) : out;
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
 */
export async function hubBrand(
  org: string,
  slug: string,
  { version, context, viewer = null }: { version?: number; context?: string | null; viewer?: HubViewer } = {},
) {
  // Two of an organization's workspaces may each have one by this slug: the public one first (setHub allows one), else the older.
  const found = await listings(and(eq(organizations.slug, org), eq(brands.slug, slug)), 5, viewer);
  const row = found.find((r) => r.visibility === "public") ?? found[0];
  if (!row) return null;
  const view = await readBrand(row.workspaceId, { id: row.id, slug: row.brand, name: row.name }, null, { version, context }).catch((err) => {
    if (err instanceof AssetError && err.code === "not_found") return null;
    throw err;
  });
  if (!view?.version) return null;
  const door = await guidelinesPortal(row);
  const [[card], versions, home, [site]] = await Promise.all([
    cards([row]),
    db
      .select({ number: brandVersions.number, publishedAt: brandVersions.publishedAt })
      .from(brandVersions)
      .where(and(eq(brandVersions.brandId, row.id), isNotNull(brandVersions.publishedAt)))
      .orderBy(desc(brandVersions.number)),
    door && portalHome(door.slug),
    door ? db.select({ terms: sql<string | null>`${portals.site} ->> 'terms'` }).from(portals).where(eq(portals.id, door.id)) : [],
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
    versions: versions.map((v) => ({ number: v.number, publishedAt: v.publishedAt! })),
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
