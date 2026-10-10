import { and, asc, count, countDistinct, desc, eq, gt, gte, inArray, isNull, not, notExists, or, sql, type SQLWrapper } from "drizzle-orm";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { assets, brandPages, brandRules, brands, brandVersions, domains, grants, groupMembers, invitations, pageViews, portals, renditions, settings, traffic, projects } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { AssetError } from "@/lib/core/errors";
import { effective } from "@/lib/core/settings";
import { FEATURES, formatSize, held, organizationsFromEnv, over, type Feature, type Limits } from "@/lib/limits";
import { can, needs } from "@/lib/permissions";
import { RENDITION_DAYS } from "@/lib/storage";

/**
 * What an organization uses, and the limits its operator set on that
 * (lib/limits.ts). `checkLimit` is the one gate: everything that would add to
 * a limited thing calls it first, and it refuses with what the limit is.
 */

export const limitsOf = async (organizationId: string): Promise<Limits> => held((await effective("limits", { organizationId })).value);

/**
 * SQL: the organization `organizationId` names is not suspended (lib/limits.ts
 * `suspended`, only ever in its limits row): for queries of what the public
 * sees, as `limitsOf` would answer it.
 */
export const notSuspended = (organizationId: SQLWrapper) =>
  sql`not exists (select 1 from ${settings} s where s.organization_id = ${organizationId} and s.project_id is null
    and s.key = 'limits' and coalesce(s.value ->> 'suspended', 'false') not in ('false', ''))`;

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
      .innerJoin(projects, eq(projects.id, assets.projectId))
      .where(and(eq(projects.organizationId, organizationId), isNull(assets.deletedAt))),
    q
      .select({ bytes: sql<number>`coalesce(sum(${renditions.bytes}), 0)::float8` })
      .from(renditions)
      .innerJoin(projects, eq(projects.id, renditions.projectId))
      .where(and(eq(projects.organizationId, organizationId), kept)),
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
export async function roomFor(projectId: string, bytes: number) {
  const [w] = await db.select({ org: projects.organizationId }).from(projects).where(eq(projects.id, projectId));
  if (!w) return false;
  const l = await limitsOf(w.org);
  return l.storage === null || !over(l.storage, await storageOf(w.org), bytes);
}

/** A rendition stored: its bytes count from now until the bucket expires it. */
export async function countRendition(key: string, projectId: string, bytes: number) {
  await db
    .insert(renditions)
    .values({ key, projectId, bytes })
    .onConflictDoUpdate({ target: renditions.key, set: { projectId, bytes, createdAt: sql`now()` } });
}

/**
 * A file deleted from a project: its renditions there stop counting with it,
 * unless another asset there still shows the same bytes (`hash`: what
 * renditions are keyed by, its still or its original). The bucket expires
 * them as usual; restored, it counts again those made from then on.
 */
export async function uncountRenditions(projectId: string, hash: string) {
  const held = db
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.projectId, projectId), isNull(assets.deletedAt), or(eq(assets.sha256, hash), sql`${assets.probe} ->> 'preview' = ${hash}`)));
  await db
    .delete(renditions)
    .where(and(eq(renditions.projectId, projectId), sql`starts_with(${renditions.key}, ${`renditions/${hash}/`})`, notExists(held)));
}

/** People with write or admin anywhere in it, and invitations that would make more: a seat is taken when it is offered. */
async function editorsOf(organizationId: string, q: Tx | typeof db = db) {
  const [[people], [waiting]] = await Promise.all([
    // A person, or a member of a group, with write or admin: each person once.
    q.execute<{ n: number }>(sql`select count(distinct u)::int as n from (
      select ${grants.userId} as u from ${grants} where ${grants.organizationId} = ${organizationId} and ${EDITOR} and ${grants.userId} is not null
      union select gm.user_id from ${groupMembers} gm join ${grants} on ${grants.groupId} = gm.group_id where ${grants.organizationId} = ${organizationId} and ${EDITOR}
    ) e`).then((r) => [r[0]]),
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

const projectsOf = async (organizationId: string, q: Tx | typeof db = db) =>
  (await q.select({ n: count() }).from(projects).where(eq(projects.organizationId, organizationId)))[0].n;

/** A project's default brand before anything is in it (no rules, pages or release): where it starts, not a brand that takes the plan's slot. */
const untouched = (q: Tx | typeof db) =>
  and(
    eq(brands.isDefault, true),
    ...[brandRules, brandPages, brandVersions].map((t) => notExists(q.select({ id: t.brandId }).from(t).where(eq(t.brandId, brands.id)))),
  )!;

const brandsOf = async (organizationId: string, q: Tx | typeof db = db) =>
  (
    await q
      .select({ n: count() })
      .from(brands)
      .innerJoin(projects, eq(projects.id, brands.projectId))
      .where(and(eq(projects.organizationId, organizationId), not(untouched(q))))
  )[0].n;

const domainsOf = async (organizationId: string, q: Tx | typeof db = db) =>
  (await q.select({ n: count() }).from(domains).where(eq(domains.organizationId, organizationId)))[0].n;

/** Already takes an editor's seat: write or admin of their own, or through a group. */
export const isEditor = async (organizationId: string, userId: string, q: Tx | typeof db = db) =>
  !!(
    await q
      .select({ id: grants.id })
      .from(grants)
      .where(
        and(
          eq(grants.organizationId, organizationId),
          EDITOR,
          or(eq(grants.userId, userId), inArray(grants.groupId, q.select({ id: groupMembers.groupId }).from(groupMembers).where(eq(groupMembers.userId, userId)))),
        ),
      )
      .limit(1)
  )[0];

const n = (count: number, what: string) => `${count} ${what}${count === 1 ? "" : "s"}`;

export type Limited = "storage" | "editors" | "projects" | "brands" | "domains" | Feature;

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
  const counted = what === "editors" || what === "projects" || what === "brands" || what === "domains";
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
    case "projects":
      if (l.projects !== null && over(l.projects, await projectsOf(organizationId, q))) refuse(`This organization has room for ${n(l.projects, "project")}`, l.projects);
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
                  isNull(settings.projectId),
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
 * One more delivery from /a/{id}: a counter per project and day. Never
 * awaited by the response, never fails it. Added up in memory and written
 * every few seconds: a library grid of 200 tiles is one write, not 200
 * waiting on the same row.
 *
 * ponytail: what a process holds when it dies (a few seconds' worth) is not counted.
 */
export function countTraffic(projectId: string, bytes: number) {
  const key = `${projectId}|${new Date().toISOString().slice(0, 10)}`;
  const c = unwritten.get(key) ?? { requests: 0, bytes: 0 };
  unwritten.set(key, { requests: c.requests + 1, bytes: c.bytes + bytes });
  flushing ??= setTimeout(writeTraffic, 5_000);
}

const unwritten = new Map<string, { requests: number; bytes: number }>();
let flushing: ReturnType<typeof setTimeout> | undefined;

async function writeTraffic() {
  const batch = [...unwritten];
  unwritten.clear();
  flushing = undefined;
  for (const [key, c] of batch) {
    const [projectId, day] = key.split("|");
    await db
      .insert(traffic)
      .values({ projectId, day, ...c })
      .onConflictDoUpdate({
        target: [traffic.projectId, traffic.day],
        set: { requests: sql`${traffic.requests} + excluded.requests`, bytes: sql`${traffic.bytes} + excluded.bytes` },
      })
      .catch((err) => console.error("traffic not counted", err));
  }
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
        .innerJoin(brands, and(eq(brands.projectId, portals.projectId), eq(brands.slug, brandSlug)))
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
    .where(and(eq(portals.id, portalId), eq(portals.projectId, caller.project.id)));
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
  const org = caller.project.organizationId;
  const since = sql`(now() at time zone 'utc')::date - ${DAYS - 1}::int`;
  const [limits, storage, editors, spaces, brandCount, domainCount, byProject, byDay] = await Promise.all([
    // Fresh: a plan just taken (a limits row the operator's billing wrote) shows here at once, not a minute later.
    effective("limits", { organizationId: org }, { fresh: true }).then((l) => held(l.value)),
    storageOf(org),
    editorsOf(org),
    projectsOf(org),
    brandsOf(org),
    domainsOf(org),
    db
      .select({
        id: projects.id,
        name: projects.name,
        storage: sql<number>`(coalesce((select sum(a.size) from ${assets} a where a.project_id = ${projects.id} and a.deleted_at is null), 0)
          + coalesce((select sum(r.bytes) from ${renditions} r where r.project_id = ${projects.id} and r.created_at > now() - make_interval(days => ${RENDITION_DAYS})), 0))::float8`,
        requests: sql<number>`coalesce(sum(${traffic.requests}), 0)::int`,
        bytes: sql<number>`coalesce(sum(${traffic.bytes}), 0)::float8`,
      })
      .from(projects)
      .leftJoin(traffic, and(eq(traffic.projectId, projects.id), gte(traffic.day, sql`${since}`)))
      .where(eq(projects.organizationId, org))
      .groupBy(projects.id)
      .orderBy(projects.createdAt),
    db
      .select({ day: traffic.day, requests: sql<number>`sum(${traffic.requests})::int`, bytes: sql<number>`sum(${traffic.bytes})::float8` })
      .from(traffic)
      .innerJoin(projects, eq(projects.id, traffic.projectId))
      .where(and(eq(projects.organizationId, org), gte(traffic.day, sql`${since}`)))
      .groupBy(traffic.day)
      .orderBy(traffic.day),
  ]);
  return {
    limits,
    billing: env.BILLING_URL ?? null,
    used: { storage, editors, projects: spaces, brands: brandCount, domains: domainCount },
    traffic: { days: DAYS, projects: byProject, daily: byDay },
  };
}
