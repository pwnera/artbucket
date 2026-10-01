import { and, asc, count, countDistinct, desc, eq, gt, gte, inArray, isNull, notExists, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { assets, brands, domains, grants, invitations, pageViews, portals, renditions, settings, traffic, workspaces } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { AssetError } from "@/lib/core/errors";
import { effective } from "@/lib/core/settings";
import { FEATURES, formatSize, organizationsFromEnv, over, type Feature, type Limits } from "@/lib/limits";
import { can, needs } from "@/lib/permissions";
import { RENDITION_DAYS } from "@/lib/storage";

/**
 * What an organization uses, and the limits its operator set on that
 * (lib/limits.ts). `checkLimit` is the one gate: everything that would add to
 * a limited thing calls it first, and it refuses with what the limit is.
 */

export const limitsOf = async (organizationId: string): Promise<Limits> => (await effective("limits", { organizationId })).value;

const EDITOR = inArray(grants.scope, ["write", "admin"]);

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Renditions the bucket still keeps (lib/storage.ts expires them). */
const kept = gt(renditions.createdAt, sql`now() - make_interval(days => ${RENDITION_DAYS})`);

/**
 * Bytes of the organization's assets, and of the renditions made of them.
 * Deleted assets don't count: deleting frees room at once.
 */
async function storageOf(organizationId: string, q: Tx | typeof db = db) {
  const [[a], [r]] = await Promise.all([
    q
      .select({ bytes: sql<number>`coalesce(sum(${assets.size}), 0)::float8` })
      .from(assets)
      .innerJoin(workspaces, eq(workspaces.id, assets.workspaceId))
      .where(and(eq(workspaces.organizationId, organizationId), isNull(assets.deletedAt))),
    q
      .select({ bytes: sql<number>`coalesce(sum(${renditions.bytes}), 0)::float8` })
      .from(renditions)
      .innerJoin(workspaces, eq(workspaces.id, renditions.workspaceId))
      .where(and(eq(workspaces.organizationId, organizationId), kept)),
  ]);
  return a.bytes + r.bytes;
}

/** Where to go about it, when the operator said (BILLING_URL). */
const manage = () => (env.BILLING_URL ? `. Manage the plan at ${env.BILLING_URL}` : "");

/** Storage past the limit, said the one way. */
const storageRefused = (l: Limits, used: number) =>
  new AssetError("limit_reached", `That would pass this organization's storage of ${formatSize(l.storage!)} (${formatSize(used)} used)${manage()}`, {
    limit: "storage",
    max: l.storage,
  });

/** The advisory lock class (with hashtext of the organization) an upload holds while it checks storage and lands. */
const STORAGE_LOCK = 73;
/** The class an add of a counted thing holds (with hashtext of the organization and the kind): checkLimit with a transaction. */
const LIMIT_LOCK = 74;

/**
 * The storage check as bytes land, inside the transaction that adds them:
 * one organization's uploads take turns here, so two can't both pass on the
 * same room. `limits` read beforehand: the transaction holds a connection and
 * must not wait on another from the pool.
 */
export async function claimStorage(tx: Tx, organizationId: string, adding: number, limits: Limits) {
  await tx.execute(sql`select pg_advisory_xact_lock(${STORAGE_LOCK}, hashtext(${organizationId}))`);
  if (limits.storage === null) return;
  const used = await storageOf(organizationId, tx);
  if (over(limits.storage, used, adding)) throw storageRefused(limits, used);
}

/**
 * Whether a new rendition of `bytes` fits in its organization's storage. It
 * is served either way; one that doesn't fit isn't kept.
 */
export async function roomFor(workspaceId: string, bytes: number) {
  const [w] = await db.select({ org: workspaces.organizationId }).from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!w) return false;
  const l = await limitsOf(w.org);
  return l.storage === null || !over(l.storage, await storageOf(w.org), bytes);
}

/** A rendition stored: its bytes count from now until the bucket expires it. */
export async function countRendition(key: string, workspaceId: string, bytes: number) {
  await db
    .insert(renditions)
    .values({ key, workspaceId, bytes })
    .onConflictDoUpdate({ target: renditions.key, set: { workspaceId, bytes, createdAt: sql`now()` } });
}

/** People with write or admin anywhere in it, and invitations that would make more: a seat is taken when it is offered. */
async function editorsOf(organizationId: string, q: Tx | typeof db = db) {
  const [[people], [waiting]] = await Promise.all([
    q.select({ n: countDistinct(grants.userId) }).from(grants).where(and(eq(grants.organizationId, organizationId), EDITOR)),
    q
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

const workspacesOf = async (organizationId: string, q: Tx | typeof db = db) =>
  (await q.select({ n: count() }).from(workspaces).where(eq(workspaces.organizationId, organizationId)))[0].n;

const brandsOf = async (organizationId: string, q: Tx | typeof db = db) =>
  (
    await q
      .select({ n: count() })
      .from(brands)
      .innerJoin(workspaces, eq(workspaces.id, brands.workspaceId))
      .where(eq(workspaces.organizationId, organizationId))
  )[0].n;

const domainsOf = async (organizationId: string, q: Tx | typeof db = db) =>
  (await q.select({ n: count() }).from(domains).where(eq(domains.organizationId, organizationId)))[0].n;

const isEditor = async (organizationId: string, userId: string, q: Tx | typeof db = db) =>
  !!(await q.select({ id: grants.id }).from(grants).where(and(eq(grants.organizationId, organizationId), eq(grants.userId, userId), EDITOR)).limit(1))[0];

const n = (count: number, what: string) => `${count} ${what}${count === 1 ? "" : "s"}`;

export type Limited = "storage" | "editors" | "workspaces" | "brands" | "domains" | Feature;

const FEATURE_LABEL: Record<Feature, string> = {
  agents: "Connecting agents and making API keys",
  shares: "Share and upload links",
  sso: "Setting up single sign-on",
  branding: "Custom branding",
  domains: "Custom domains",
};

/**
 * Refuse, before anything moves, what would take the organization past a
 * limit. `adding`: bytes for storage, else how many. `user`: for editors,
 * who would get write; already an editor, they take no new seat.
 *
 * Before anything moves it counts without a lock, so two at once can both
 * pass. With `tx`, the transaction that adds the thing, one organization's
 * adds of a kind take turns (an advisory lock, held to commit) and count in
 * that transaction: the next one sees the last one's. Call it first in the
 * transaction, so it waits holding nothing else. Storage is checked again as
 * the bytes land (claimStorage).
 */
export async function checkLimit(organizationId: string, what: Limited, { adding = 1, user, tx }: { adding?: number; user?: string; tx?: Tx } = {}) {
  // Read before the lock (a minute's memo): the lock's holder must not wait on another connection from the pool.
  const l = await limitsOf(organizationId);
  if (l.readOnly) throw new AssetError("read_only", "This organization is read-only");
  const refuse = (message: string, limit: number) => {
    throw new AssetError("limit_reached", message + manage(), { limit: what, max: limit });
  };
  // A feature switched off refuses before any count: domains is both.
  if (l.features && (FEATURES as readonly string[]).includes(what) && !l.features.includes(what as Feature)) {
    throw new AssetError("limit_reached", `${FEATURE_LABEL[what as Feature]} is off for this organization${manage()}`, { limit: what });
  }
  const q = tx ?? db;
  const counted = what === "editors" || what === "workspaces" || what === "brands" || what === "domains";
  if (tx && counted && l[what] !== null) {
    await tx.execute(sql`select pg_advisory_xact_lock(${LIMIT_LOCK}, hashtext(${`${organizationId}:${what}`}))`);
  }
  switch (what) {
    case "storage":
      if (l.storage !== null) {
        const used = await storageOf(organizationId);
        if (over(l.storage, used, adding)) throw storageRefused(l, used);
      }
      return;
    case "editors":
      if (l.editors !== null && !(user && (await isEditor(organizationId, user, q))) && over(l.editors, await editorsOf(organizationId, q))) {
        refuse(`This organization has room for ${n(l.editors, "editor")}, invitations included`, l.editors);
      }
      return;
    case "workspaces":
      if (l.workspaces !== null && over(l.workspaces, await workspacesOf(organizationId, q))) refuse(`This organization has room for ${n(l.workspaces, "workspace")}`, l.workspaces);
      return;
    case "brands":
      if (l.brands !== null && over(l.brands, await brandsOf(organizationId, q))) refuse(`This organization has room for ${n(l.brands, "brand")}`, l.brands);
      return;
    case "domains":
      if (l.domains !== null && over(l.domains, await domainsOf(organizationId, q))) refuse(`This organization has room for ${n(l.domains, "custom domain")}`, l.domains);
      return;
  }
}

/**
 * Organizations someone is admin of that run on the server's own limits: no limits row of their own, so no plan,
 * or one marked `lapsing`, a plan whose payment failed or stopped: its limits hold while that is sorted out, but
 * it no longer stands for a plan, so it doesn't make room for another organization.
 */
const unplannedOf = async (userId: string) =>
  (
    await db
      .select({ n: countDistinct(grants.organizationId) })
      .from(grants)
      .where(
        and(
          eq(grants.userId, userId),
          eq(grants.resource, "organization"),
          eq(grants.scope, "admin"),
          notExists(
            db
              .select({ id: settings.id })
              .from(settings)
              .where(
                and(
                  eq(settings.organizationId, grants.organizationId),
                  eq(settings.key, "limits"),
                  isNull(settings.workspaceId),
                  sql`coalesce((${settings.value} ->> 'lapsing')::boolean, false) = false`,
                ),
              ),
          ),
        ),
      )
  )[0].n;

/**
 * Refuse a new organization to someone already admin of as many without a
 * plan as LIMIT_ORGANIZATIONS allows: otherwise every new one would bring
 * the server's limits again. One with a plan of its own does not count, unless
 * the plan is lapsing, nor does the one sign-up makes (people.ts: welcome).
 *
 * ponytail: count, then make, without a lock, like checkLimit: two made at
 * the same moment can both pass. Lock on the user if that is ever abused.
 */
export async function checkOrganizations(userId: string) {
  const limit = organizationsFromEnv(process.env);
  if (limit === null) return;
  const had = await unplannedOf(userId);
  if (over(limit, had)) {
    const plan = env.BILLING_URL ? `. Take a plan for one of them at ${env.BILLING_URL} to make another` : "";
    throw new AssetError("limit_reached", `You are admin of ${n(had, "organization")} without a plan, as many as this server allows${plan}`, {
      limit: "organizations",
      max: limit,
    });
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
    // Fresh: a plan just taken (a limits row the operator's billing wrote) shows here at once, not a minute later.
    effective("limits", { organizationId: org }, { fresh: true }).then((l) => l.value),
    storageOf(org),
    editorsOf(org),
    workspacesOf(org),
    brandsOf(org),
    domainsOf(org),
    db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        storage: sql<number>`(coalesce((select sum(a.size) from ${assets} a where a.workspace_id = ${workspaces.id} and a.deleted_at is null), 0)
          + coalesce((select sum(r.bytes) from ${renditions} r where r.workspace_id = ${workspaces.id} and r.created_at > now() - make_interval(days => ${RENDITION_DAYS})), 0))::float8`,
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
    billing: env.BILLING_URL ?? null,
    used: { storage, editors, workspaces: spaces, brands: brandCount, domains: domainCount },
    traffic: { days: DAYS, workspaces: byWorkspace, daily: byDay },
  };
}
