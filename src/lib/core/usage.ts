import { and, asc, count, countDistinct, desc, eq, gt, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, brands, domains, grants, invitations, pageViews, portals, traffic, workspaces } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { AssetError } from "@/lib/core/errors";
import { effective } from "@/lib/core/settings";
import { formatSize, over, type Feature, type Limits } from "@/lib/limits";
import { can, needs } from "@/lib/permissions";

/**
 * What an organization uses, and the limits its operator set on that
 * (lib/limits.ts). `checkLimit` is the one gate: everything that would add to
 * a limited thing calls it first, and it refuses with what the limit is.
 */

export const limitsOf = async (organizationId: string): Promise<Limits> => (await effective("limits", { organizationId })).value;

const EDITOR = inArray(grants.scope, ["write", "admin"]);

/** Bytes of the organization's assets. Deleted ones don't count: deleting frees room at once. */
async function storageOf(organizationId: string) {
  const [row] = await db
    .select({ bytes: sql<number>`coalesce(sum(${assets.size}), 0)::float8` })
    .from(assets)
    .innerJoin(workspaces, eq(workspaces.id, assets.workspaceId))
    .where(and(eq(workspaces.organizationId, organizationId), isNull(assets.deletedAt)));
  return row.bytes;
}

/** People with write or admin anywhere in it, and invitations that would make more: a seat is taken when it is offered. */
async function editorsOf(organizationId: string) {
  const [[people], [waiting]] = await Promise.all([
    db.select({ n: countDistinct(grants.userId) }).from(grants).where(and(eq(grants.organizationId, organizationId), EDITOR)),
    db
      .select({ n: count() })
      .from(invitations)
      .where(
        and(
          eq(invitations.organizationId, organizationId),
          inArray(invitations.scope, ["write", "admin"]),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, sql`now()`),
        ),
      ),
  ]);
  return people.n + waiting.n;
}

const workspacesOf = async (organizationId: string) =>
  (await db.select({ n: count() }).from(workspaces).where(eq(workspaces.organizationId, organizationId)))[0].n;

const brandsOf = async (organizationId: string) =>
  (
    await db
      .select({ n: count() })
      .from(brands)
      .innerJoin(workspaces, eq(workspaces.id, brands.workspaceId))
      .where(eq(workspaces.organizationId, organizationId))
  )[0].n;

const domainsOf = async (organizationId: string) =>
  (await db.select({ n: count() }).from(domains).where(eq(domains.organizationId, organizationId)))[0].n;

const isEditor = async (organizationId: string, userId: string) =>
  !!(await db.select({ id: grants.id }).from(grants).where(and(eq(grants.organizationId, organizationId), eq(grants.userId, userId), EDITOR)).limit(1))[0];

const n = (count: number, what: string) => `${count} ${what}${count === 1 ? "" : "s"}`;

export type Limited = "storage" | "editors" | "workspaces" | "brands" | "domains" | Feature;

const FEATURE_LABEL: Record<Feature, string> = { agents: "Connecting agents and making API keys", shares: "Share and upload links" };

/**
 * Refuse, before anything moves, what would take the organization past a
 * limit. `adding`: bytes for storage, else how many. `user`: for editors,
 * who would get write; already an editor, they take no new seat.
 *
 * ponytail: count, then act, without a lock: two uploads at once can both
 * pass and overshoot by one. Lock per organization if a hard ceiling matters.
 */
export async function checkLimit(organizationId: string, what: Limited, { adding = 1, user }: { adding?: number; user?: string } = {}) {
  const l = await limitsOf(organizationId);
  if (l.readOnly) throw new AssetError("read_only", "This organization is read-only");
  const refuse = (message: string, limit: number) => {
    throw new AssetError("limit_reached", message, { limit: what, max: limit });
  };
  switch (what) {
    case "storage":
      if (l.storage !== null) {
        const used = await storageOf(organizationId);
        if (over(l.storage, used, adding)) refuse(`That would pass this organization's storage of ${formatSize(l.storage)} (${formatSize(used)} used)`, l.storage);
      }
      return;
    case "editors":
      if (l.editors !== null && !(user && (await isEditor(organizationId, user))) && over(l.editors, await editorsOf(organizationId))) {
        refuse(`This organization has room for ${n(l.editors, "editor")}, invitations included`, l.editors);
      }
      return;
    case "workspaces":
      if (l.workspaces !== null && over(l.workspaces, await workspacesOf(organizationId))) refuse(`This organization has room for ${n(l.workspaces, "workspace")}`, l.workspaces);
      return;
    case "brands":
      if (l.brands !== null && over(l.brands, await brandsOf(organizationId))) refuse(`This organization has room for ${n(l.brands, "brand")}`, l.brands);
      return;
    case "domains":
      if (l.domains !== null && over(l.domains, await domainsOf(organizationId))) refuse(`This organization has room for ${n(l.domains, "custom domain")}`, l.domains);
      return;
    default:
      if (l.features && !l.features.includes(what)) throw new AssetError("limit_reached", `${FEATURE_LABEL[what]} is off for this organization`, { limit: what });
  }
}

/**
 * One more delivery from /a/{id}: a counter per workspace and day. Never
 * awaited by the response, never fails it.
 *
 * ponytail: one upsert per request. Batch in memory and flush every few
 * seconds if delivery traffic makes this row hot.
 */
export function countTraffic(workspaceId: string, bytes: number) {
  void db
    .insert(traffic)
    .values({ workspaceId, day: sql`(now() at time zone 'utc')::date`, requests: 1, bytes })
    .onConflictDoUpdate({
      target: [traffic.workspaceId, traffic.day],
      set: { requests: sql`${traffic.requests} + 1`, bytes: sql`${traffic.bytes} + excluded.bytes` },
    })
    .catch((err) => console.error("traffic not counted", err));
}

/**
 * One more read of a portal's page: a counter per portal, brand, page and
 * day, like countTraffic. Named by slugs, as the site route has them; the
 * ids are looked up in the same statement, and a portal or brand gone since
 * counts nothing.
 *
 * ponytail: pages only; per-asset downloads come with the v1.3 analytics.
 */
export function recordPageView(portalSlug: string, brandSlug: string, page: string) {
  void db
    .insert(pageViews)
    .select((qb) =>
      qb
        .select({
          portalId: portals.id,
          brandId: brands.id,
          page: sql<string>`${page}::text`.as("page"),
          day: sql<string>`(now() at time zone 'utc')::date`.as("day"),
          views: sql<number>`1`.as("views"),
        })
        .from(portals)
        .innerJoin(brands, and(eq(brands.workspaceId, portals.workspaceId), eq(brands.slug, brandSlug)))
        .where(eq(portals.slug, portalSlug)),
    )
    .onConflictDoUpdate({ target: [pageViews.portalId, pageViews.brandId, pageViews.page, pageViews.day], set: { views: sql`${pageViews.views} + 1` } })
    .catch((err) => console.error("page view not counted", err));
}

const DAYS = 30;

/** GET /api/v1/portals/{id}/views: its pages' reads over the last 30 days, per brand and page, most read first. Null: no such portal here. */
export async function portalViews(caller: Caller, portalId: string) {
  if (!can(caller, "portal.manage")) throw new AssetError("forbidden", `Portals take ${needs("portal.manage")}`);
  const [p] = await db
    .select({ id: portals.id })
    .from(portals)
    .where(and(eq(portals.id, portalId), eq(portals.workspaceId, caller.workspace.id)));
  if (!p) return null;
  const views = sql<number>`sum(${pageViews.views})::int`;
  const pages = await db
    .select({ brand: { slug: brands.slug, name: brands.name }, page: pageViews.page, views })
    .from(pageViews)
    .innerJoin(brands, eq(brands.id, pageViews.brandId))
    .where(and(eq(pageViews.portalId, p.id), gte(pageViews.day, sql`(now() at time zone 'utc')::date - ${DAYS - 1}::int`)))
    .groupBy(brands.id, pageViews.page)
    .orderBy(desc(views), asc(brands.name), asc(pageViews.page));
  return { days: DAYS, pages };
}

/** GET /api/v1/usage: what the organization uses against its limits, and its last 30 days of traffic. Organization admin. */
export async function usageOf(caller: Caller) {
  if (!can(caller, "organization.manage")) throw new AssetError("forbidden", `Usage takes ${needs("organization.manage")}`);
  const org = caller.workspace.organizationId;
  const since = sql`(now() at time zone 'utc')::date - ${DAYS - 1}::int`;
  const [limits, storage, editors, spaces, brandCount, domainCount, byWorkspace, byDay] = await Promise.all([
    limitsOf(org),
    storageOf(org),
    editorsOf(org),
    workspacesOf(org),
    brandsOf(org),
    domainsOf(org),
    db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        storage: sql<number>`coalesce((select sum(a.size) from ${assets} a where a.workspace_id = ${workspaces.id} and a.deleted_at is null), 0)::float8`,
        requests: sql<number>`coalesce(sum(${traffic.requests}), 0)::int`,
        bytes: sql<number>`coalesce(sum(${traffic.bytes}), 0)::float8`,
      })
      .from(workspaces)
      .leftJoin(traffic, and(eq(traffic.workspaceId, workspaces.id), gte(traffic.day, sql`${since}`)))
      .where(eq(workspaces.organizationId, org))
      .groupBy(workspaces.id)
      .orderBy(workspaces.createdAt),
    db
      .select({ day: traffic.day, requests: sql<number>`sum(${traffic.requests})::int`, bytes: sql<number>`sum(${traffic.bytes})::float8` })
      .from(traffic)
      .innerJoin(workspaces, eq(workspaces.id, traffic.workspaceId))
      .where(and(eq(workspaces.organizationId, org), gte(traffic.day, sql`${since}`)))
      .groupBy(traffic.day)
      .orderBy(traffic.day),
  ]);
  return {
    limits,
    used: { storage, editors, workspaces: spaces, brands: brandCount, domains: domainCount },
    traffic: { days: DAYS, workspaces: byWorkspace, daily: byDay },
  };
}
