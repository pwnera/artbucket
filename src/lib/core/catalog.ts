import { and, asc, desc, eq, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  activity,
  apiKeys,
  assets,
  brandVersions,
  catalogEdges,
  catalogObjects,
  collections,
  grants,
  groupMembers,
  groups,
  organizations,
  portals,
  shareLinks,
  users,
  workspaces,
} from "@/lib/db/schema";
import { accessIn, highest, reach, widest, type Access } from "@/lib/access";
import { allows, roleName, type Scope } from "@/lib/scopes";
import {
  EXPIRING_DAYS,
  formatAddress,
  formatQuery,
  impactLine,
  parseAddress,
  type CatalogQuery,
  type CatalogStatus,
  type CatalogType,
  type EdgeKind,
} from "@/lib/catalog";
import { heldBy, hiddenIn, workspacesOf, type Caller, type Workspace } from "@/lib/core/access";

/**
 * The catalog (PRD: Artbucket Catalog): one search, one describe, one lineage
 * and one "who can reach it" over every type in an organization, read from
 * the views in lib/db/schema.ts. Only what the caller can reach is returned
 * or counted: each project of the organization they can open, with what their
 * grants add up to there (lib/access.ts).
 */

const o = catalogObjects;

/** A project of the caller's organization they can open, and what they may do there. */
type Reach = { workspace: Workspace; access: Access };

/**
 * Every project the catalog shows this caller. A person: each one of the
 * organization they hold a grant in or on. A key or nobody: the one they are in.
 */
export async function reachOf(caller: Caller): Promise<Reach[]> {
  if (!caller.user || caller.key) return widest(caller) ? [{ workspace: caller.workspace, access: caller }] : [];
  const { grants: mine, workspaces: open } = await workspacesOf(caller.user.id);
  const here = open.filter((w) => w.organizationId === caller.workspace.organizationId);
  const hidden = await Promise.all(here.map((w) => (w.id === caller.workspace.id ? caller.hidden : hiddenIn(w.id))));
  return here
    .map((w, i) => ({ workspace: w, access: w.id === caller.workspace.id ? (caller as Access) : accessIn(mine, w, hidden[i]) }))
    .filter((r) => widest(r.access));
}

const uuids = (ids: string[]) => sql`array[${sql.join(
  ids.map((id) => sql`${id}`),
  sql`, `,
)}]::uuid[]`;

/**
 * What a caller sees of one project, as SQL over the catalog: all of it as an
 * admin; else brands, portals and their parts with any grant there, and
 * collections and assets as lib/core/assets.ts visible() has them.
 */
function seenIn({ workspace, access }: Reach): SQL {
  const inW = eq(o.workspaceId, workspace.id);
  if (access.scope === "admin") return inW;
  const r = reach(access, "read");
  const open = allows(access.scope, "read") ? sql`not ${o.private}` : sql`false`;
  const asset = or(
    open,
    r.assets.length ? inArray(o.id, r.assets) : undefined,
    r.collections.length ? sql`${o.collections} && ${uuids(r.collections)}` : undefined,
  )!;
  const collection = or(open, r.collections.length ? inArray(o.id, r.collections) : undefined)!;
  return and(inW, sql`(case ${o.type} when 'asset' then ${asset} when 'collection' then ${collection} else true end)`)!;
}

const seen = (reaches: Reach[]) => (reaches.length ? or(...reaches.map(seenIn))! : sql`false`);

const todaySql = sql`to_char(now() at time zone 'utc', 'YYYY-MM-DD')`;
const expiredSql = sql`(${o.expires} is not null and ${o.expires} < ${todaySql})`;
const expiringSql = sql<boolean>`(${o.status} = 'current' and ${o.expires} is not null and ${o.expires} >= ${todaySql}
  and ${o.expires} <= to_char(now() at time zone 'utc' + interval '${sql.raw(String(EXPIRING_DAYS))} days', 'YYYY-MM-DD'))`;

const itemColumns = {
  id: o.id,
  type: o.type,
  slug: o.slug,
  name: o.name,
  description: o.description,
  status: o.status,
  release: o.release,
  expires: o.expires,
  expiring: expiringSql,
  private: o.private,
  tags: o.tags,
  parentId: o.parentId,
  workspaceId: o.workspaceId,
  createdAt: o.createdAt,
  updatedAt: o.updatedAt,
  project: { id: workspaces.id, slug: workspaces.slug, name: workspaces.name },
  org: organizations.slug,
};

type Row = {
  id: string;
  type: CatalogType;
  slug: string;
  name: string;
  description: string | null;
  status: CatalogStatus;
  release: number | null;
  expires: string | null;
  expiring: boolean;
  private: boolean;
  tags: string[];
  parentId: string | null;
  workspaceId: string;
  createdAt: Date;
  updatedAt: Date;
  project: { id: string; slug: string; name: string };
  org: string;
};

export type CatalogItem = Omit<Row, "org" | "workspaceId" | "parentId"> & {
  address: string;
  parent: { id: string; type: CatalogType; slug: string; name: string } | null;
};

const rows = (where: SQL) =>
  db
    .select(itemColumns)
    .from(o)
    .innerJoin(workspaces, eq(workspaces.id, o.workspaceId))
    .innerJoin(organizations, eq(organizations.id, workspaces.organizationId))
    .where(where);

/** Rows as the API shows them: each with its address and, for a part, the object it belongs to. */
async function items(list: Row[]): Promise<CatalogItem[]> {
  const parentIds = [...new Set(list.flatMap((r) => (r.parentId ? [r.parentId] : [])))];
  const parents = parentIds.length ? await db.select({ id: o.id, type: o.type, slug: o.slug, name: o.name }).from(o).where(inArray(o.id, parentIds)) : [];
  const byId = new Map(parents.map((p) => [p.id, p]));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return list.map(({ org, workspaceId: _w, parentId, ...r }) => {
    const p = parentId ? byId.get(parentId) : undefined;
    return {
      ...r,
      address: formatAddress({ org, project: r.project.slug, type: r.type, slug: r.slug, release: r.release, parent: p ? { type: p.type, slug: p.slug } : null }),
      parent: p ?? null,
    };
  });
}
/** An object by id or address, if the caller can reach it. */
export async function findObject(caller: Caller, ref: string, reaches?: Reach[]): Promise<CatalogItem | null> {
  const r = reaches ?? (await reachOf(caller));
  const id = await resolve(caller, ref);
  if (!id) return null;
  const [row] = await rows(and(eq(o.id, id), seen(r))!).limit(1);
  return row ? (await items([row as Row]))[0] : null;
}

/** An id, or the id an address names in the caller's organization. */
async function resolve(caller: Caller, ref: string): Promise<string | null> {
  if (/^[0-9a-f-]{36}$/i.test(ref)) return ref;
  const a = parseAddress(ref);
  if (!a || a.org !== caller.workspace.organization.slug) return null;
  const [w] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(and(eq(workspaces.organizationId, caller.workspace.organizationId), eq(workspaces.slug, a.project)));
  if (!w) return null;
  const pick = (type: string, slug: string, parentId?: string) =>
    db
      .select({ id: o.id, release: o.release, status: o.status })
      .from(o)
      .where(and(eq(o.workspaceId, w.id), eq(o.type, type as CatalogType), eq(o.slug, slug), parentId ? eq(o.parentId, parentId) : undefined))
      .orderBy(desc(o.updatedAt));
  const found = await pick(a.type, a.slug);
  // An asset's @n is that version; without one, the current version, else the newest.
  const object =
    (a.type === "asset" && a.release ? found.find((f) => f.release === a.release) : undefined) ??
    found.find((f) => f.status === "current") ??
    found[0];
  if (!object) return null;
  if (!a.part) return object.id;
  const [part] = await pick(a.part.type, a.part.slug, object.id);
  return part?.id ?? null;
}

/** Ids downstream (or upstream) of these, up to `depth` hops: what `uses:` and the impact line read. */
async function walk(ids: string[], direction: "down" | "up", depth = 6): Promise<Set<string>> {
  const seenIds = new Set<string>();
  let frontier = ids;
  for (let d = 0; d < depth && frontier.length; d++) {
    const next =
      direction === "down"
        ? await db.select({ id: catalogEdges.toId }).from(catalogEdges).where(inArray(catalogEdges.fromId, frontier))
        : await db.select({ id: catalogEdges.fromId }).from(catalogEdges).where(inArray(catalogEdges.toId, frontier));
    frontier = [...new Set(next.map((n) => n.id))].filter((id) => !seenIds.has(id) && !ids.includes(id));
    for (const id of frontier) seenIds.add(id);
  }
  return seenIds;
}

/** `logo:*` & `prim:*`: every word, as a prefix, so "log" finds the logo as it is typed. */
const prefixQuery = (words: string) =>
  words
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => `${w}:*`)
    .join(" & ");

async function whereOf(caller: Caller, q: CatalogQuery, reaches: Reach[]): Promise<{ where: SQL; rank: SQL | null }> {
  const ts = prefixQuery(q.words);
  const tsq = ts ? sql`to_tsquery('simple', ${ts})` : null;
  const ids = async (refs: string[]) => (await Promise.all(refs.map((r) => resolve(caller, r)))).filter((x): x is string => !!x);
  const [uses, usedBy] = await Promise.all([
    q.uses.length ? ids(q.uses).then((x) => walk(x, "down")) : null,
    q.usedBy.length ? ids(q.usedBy).then((x) => walk(x, "up")) : null,
  ]);
  const admins = q.admin.includes("me") && caller.user ? db.select({ id: grants.resourceId }).from(grants).where(and(heldBy(caller.user.id), eq(grants.scope, "admin"))) : null;
  const where = and(
    seen(reaches),
    tsq ? sql`${o.search} @@ ${tsq}` : undefined,
    q.types.length ? inArray(o.type, q.types) : undefined,
    q.projects.length ? inArray(workspaces.slug, q.projects) : undefined,
    q.statuses.length ? inArray(o.status, q.statuses) : undefined,
    ...q.tags.map((t) => sql`${o.tags} @> ${JSON.stringify([t.toLowerCase()])}::jsonb`),
    uses ? (uses.size ? inArray(o.id, [...uses]) : sql`false`) : undefined,
    usedBy ? (usedBy.size ? inArray(o.id, [...usedBy]) : sql`false`) : undefined,
    q.admin.length ? (admins ? inArray(o.id, admins) : sql`false`) : undefined,
  )!;
  return { where, rank: tsq ? sql`ts_rank(${o.search}, ${tsq})` : null };
}

/** Hidden unless asked for: replaced, archived, and past their last day of use. */
const retiredSql = sql`(${o.status} in ('replaced', 'archived') or ${expiredSql})`;

export type CatalogResults = {
  query: string;
  total: number;
  counts: Partial<Record<CatalogType, number>>;
  /** Per project: what the refine panel counts. */
  projects: { slug: string; name: string; count: number }[];
  items: CatalogItem[];
  /** Matches left out because they are replaced, archived or expired, and one to name. */
  hidden: { count: number; example: string | null };
  next: number | null;
};

/**
 * Search every type at once. Ranked by the words when there are some, else
 * newest first; `limit` per page, `cursor` the offset the last page gave.
 * Without a `status:` filter, retired objects are counted aside, not shown.
 */
export async function searchCatalog(caller: Caller, q: CatalogQuery, { limit = 30, cursor = 0 } = {}): Promise<CatalogResults> {
  const reaches = await reachOf(caller);
  const { where, rank } = await whereOf(caller, q, reaches);
  const shown = q.statuses.length ? where : and(where, sql`not ${retiredSql}`)!;
  const count = (w: SQL) =>
    db
      .select({ type: o.type, project: workspaces.slug, name: workspaces.name, n: sql<number>`count(*)::int` })
      .from(o)
      .innerJoin(workspaces, eq(workspaces.id, o.workspaceId))
      .where(w)
      .groupBy(o.type, workspaces.slug, workspaces.name);
  const [found, counted, hidden] = await Promise.all([
    rows(shown)
      .orderBy(...(rank ? [desc(rank)] : []), desc(o.updatedAt), asc(o.id))
      .limit(limit + 1)
      .offset(cursor),
    count(shown),
    q.statuses.length
      ? []
      : rows(and(where, retiredSql)!)
          .orderBy(...(rank ? [desc(rank)] : []), desc(o.updatedAt))
          .limit(1)
          .then(async (r) => (r.length ? [{ row: r[0] as Row, n: (await count(and(where, retiredSql)!)).reduce((s, c) => s + c.n, 0) }] : [])),
  ]);
  const counts: Partial<Record<CatalogType, number>> = {};
  const projects = new Map<string, { slug: string; name: string; count: number }>();
  for (const c of counted) {
    counts[c.type] = (counts[c.type] ?? 0) + c.n;
    const p = projects.get(c.project) ?? { slug: c.project, name: c.name, count: 0 };
    p.count += c.n;
    projects.set(c.project, p);
  }
  const page = found.slice(0, limit) as Row[];
  return {
    query: formatQuery(q),
    total: Object.values(counts).reduce((s, n) => s + (n ?? 0), 0),
    counts,
    projects: [...projects.values()].sort((a, b) => b.count - a.count),
    items: await items(page),
    hidden: hidden.length ? { count: hidden[0].n, example: await retiredWhy(hidden[0].row) } : { count: 0, example: null },
    next: found.length > limit ? cursor + limit : null,
  };
}

/** "logo-primary.svg @3 matches too, but it was replaced by @4." */
async function retiredWhy(r: Row): Promise<string> {
  const name = `${r.name}${r.release ? ` @${r.release}` : ""}`;
  if (r.status === "replaced" && r.type === "asset") {
    const [by] = await db
      .select({ filename: assets.filename, version: assets.version })
      .from(assets)
      .where(eq(assets.id, sql`(select superseded_by from ${assets} where id = ${r.id})`));
    if (by) return `${name} matches too, but it was replaced by ${by.filename === r.name && by.version ? `@${by.version}` : by.filename}.`;
  }
  if (r.status === "replaced") return `${name} matches too, but it was replaced.`;
  if (r.status === "archived") return `${name} matches too, but it is archived.`;
  return `${name} matches too, but its last day of use (${r.expires}) has passed.`;
}

export type LineageNode = CatalogItem & { up: number; down: number };
export type LineageEdge = { from: string; to: string; kind: EdgeKind; via: string | null };

/**
 * Upstream and downstream of one object, `depth` hops each way (1 to 6),
 * through what the caller can reach only: an edge into something they can't
 * see is counted in `unseen`, and the walk stops there. Each node says how
 * many edges it has each way, so a client can offer to expand it.
 */
export async function lineage(caller: Caller, ref: string, { depth = 3, direction = ["up", "down"] as ("up" | "down")[] } = {}) {
  const reaches = await reachOf(caller);
  const root = await findObject(caller, ref, reaches);
  if (!root) return null;
  const hops = Math.min(6, Math.max(1, depth));
  const edges = new Map<string, LineageEdge>();
  const ids = new Set([root.id]);
  const unseen = new Set<string>();
  for (const dir of direction) {
    let frontier = [root.id];
    for (let d = 0; d < hops && frontier.length; d++) {
      const found = await db
        .select()
        .from(catalogEdges)
        .where(dir === "down" ? inArray(catalogEdges.fromId, frontier) : inArray(catalogEdges.toId, frontier));
      const far = found.map((e) => (dir === "down" ? e.toId : e.fromId)).filter((id) => !ids.has(id) && !unseen.has(id));
      const visible = far.length ? new Set((await db.select({ id: o.id }).from(o).where(and(inArray(o.id, far), seen(reaches)))).map((r) => r.id)) : new Set<string>();
      frontier = [];
      for (const e of found) {
        const other = dir === "down" ? e.toId : e.fromId;
        if (!ids.has(other) && !visible.has(other)) {
          unseen.add(other);
          continue;
        }
        if (!ids.has(other)) frontier.push(other);
        ids.add(other);
        edges.set(`${e.fromId}>${e.toId}>${e.kind}`, { from: e.fromId, to: e.toId, kind: e.kind, via: e.via });
      }
    }
  }
  const list = [...ids];
  const [found, degrees] = await Promise.all([
    rows(inArray(o.id, list)),
    db
      .select({ id: sql<string>`n.id`, up: sql<number>`count(*) filter (where n.side = 'up')::int`, down: sql<number>`count(*) filter (where n.side = 'down')::int` })
      .from(
        sql`(select ${catalogEdges.toId} as id, 'up' as side from ${catalogEdges} where ${inArray(catalogEdges.toId, list)}
          union all select ${catalogEdges.fromId}, 'down' from ${catalogEdges} where ${inArray(catalogEdges.fromId, list)}) n`,
      )
      .groupBy(sql`n.id`),
  ]);
  const deg = new Map(degrees.map((d) => [d.id, d]));
  const nodes: LineageNode[] = (await items(found as Row[])).map((n) => ({ ...n, up: deg.get(n.id)?.up ?? 0, down: deg.get(n.id)?.down ?? 0 }));
  return { root: root.id, nodes, edges: [...edges.values()], unseen: unseen.size, impact: await impact(root) };
}

/** What changing it reaches: everything downstream, seen or not, and in how many projects. */
export async function impact(root: CatalogItem) {
  const down = [...(await walk([root.id], "down"))];
  const projects = down.length ? await db.selectDistinct({ w: o.workspaceId }).from(o).where(inArray(o.id, down)) : [];
  return { things: down.length, projects: projects.length, line: impactLine(root.name, down.length, projects.length) };
}

/**
 * One object, described: what search says of it, and what it is part of,
 * what uses it (the first five, and how many), and its lineage's counts.
 */
export async function describeObject(caller: Caller, ref: string) {
  const reaches = await reachOf(caller);
  const item = await findObject(caller, ref, reaches);
  if (!item) return null;
  const [down, up] = await Promise.all([
    db.select({ id: catalogEdges.toId, kind: catalogEdges.kind }).from(catalogEdges).where(eq(catalogEdges.fromId, item.id)),
    db.select({ id: catalogEdges.fromId }).from(catalogEdges).where(eq(catalogEdges.toId, item.id)),
  ]);
  const usedIds = [...new Set(down.filter((d) => d.kind !== "replaced_by").map((d) => d.id))];
  const used = usedIds.length ? await items((await rows(and(inArray(o.id, usedIds), seen(reaches))!).orderBy(asc(o.type), asc(o.name))) as Row[]) : [];
  return {
    ...item,
    usedBy: used.slice(0, 5),
    usedByCount: used.length,
    lineage: { up: up.length, down: down.length },
    open: openPath(item),
  };
}

/** Where the app shows it, in its own project (the proxy's `?workspace=` opens that one). */
export function openPath(item: Pick<CatalogItem, "id" | "type" | "slug" | "parent" | "project">) {
  const w = `workspace=${item.project.id}`;
  const brand = item.parent?.slug ?? "";
  switch (item.type) {
    case "asset":
      return `/assets/${item.id}?${w}`;
    case "collection":
      return `/?collection=${item.id}&${w}`;
    case "brand":
      return `/brands/${item.slug}?${w}`;
    case "portal":
      return `/portals?${w}`;
    case "rule":
      return `/brands/${brand}/rules?${w}`;
    case "page":
      return `/brands/${brand}/guidelines?page=${item.slug}&${w}`;
  }
}

/** The tree's rows: every object of every project the caller reaches, and their parts (a brand's rules and pages), retired aside. */
export async function catalogTree(caller: Caller) {
  const reaches = await reachOf(caller);
  const found = (await rows(and(seen(reaches), ne(o.status, "replaced"))!).orderBy(asc(o.type), asc(o.name))) as Row[];
  const list = await items(found);
  return {
    projects: reaches.map((r) => ({
      id: r.workspace.id,
      slug: r.workspace.slug,
      name: r.workspace.name,
      role: widest(r.access),
      objects: list.filter((i) => i.project.id === r.workspace.id),
    })),
  };
}

export type Holder = {
  kind: "person" | "agent" | "public" | "link";
  who: string;
  role: string;
  scope: Scope | null;
  /** The grant the role comes through, in words: "Project Corporate", "Directly on this asset". */
  via: string;
};

/**
 * Who can reach it, and through what: each person's highest role on its path
 * (organization, project, the object, an asset's collections), private objects
 * turning away roles below admin from above; agent keys of its project, capped
 * at their person; and the delivery door (a public asset, a portal's access,
 * view links). `who`: one person, by id or email.
 */
export async function whoCan(caller: Caller, ref: string, who?: string) {
  const item = await findObject(caller, ref);
  if (!item) return null;
  const objectId = item.parent?.id ?? item.id;
  const objectType = item.parent?.type ?? item.type;
  const [obj] = await db.select({ collections: o.collections, private: o.private }).from(o).where(eq(o.id, objectId));
  const [ws] = await db.select({ organizationId: workspaces.organizationId }).from(workspaces).where(eq(workspaces.id, item.project.id));
  const cols = objectType === "asset" ? obj.collections : objectType === "collection" ? [objectId] : [];
  const names = cols.length ? await db.select({ id: collections.id, name: collections.name }).from(collections).where(inArray(collections.id, cols)) : [];
  const path = or(
    and(eq(grants.resource, "organization"), eq(grants.resourceId, ws.organizationId)),
    and(eq(grants.resource, "workspace"), eq(grants.resourceId, item.project.id)),
    objectType === "asset" ? and(eq(grants.resource, "asset"), eq(grants.resourceId, objectId)) : undefined,
    cols.length ? and(eq(grants.resource, "collection"), inArray(grants.resourceId, cols)) : undefined,
  );
  // A person's own grants, and their groups': a group's grant is each member's, said as coming through it.
  const person = who ? or(eq(users.id, who), eq(users.email, who.toLowerCase())) : undefined;
  const cols_ = { userId: users.id, name: users.name, email: users.email, resource: grants.resource, resourceId: grants.resourceId, scope: grants.scope };
  const [own, viaGroups] = await Promise.all([
    db.select({ ...cols_, group: sql<string | null>`null` }).from(grants).innerJoin(users, eq(users.id, grants.userId)).where(and(path, person)),
    db
      .select({ ...cols_, group: groups.name })
      .from(grants)
      .innerJoin(groups, eq(groups.id, grants.groupId))
      .innerJoin(groupMembers, eq(groupMembers.groupId, groups.id))
      .innerJoin(users, eq(users.id, groupMembers.userId))
      .where(and(path, person)),
  ]);
  const found = [...own, ...viaGroups];
  const via = (g: (typeof found)[number]) => {
    const on =
      g.resource === "organization"
        ? `Organization ${caller.workspace.organization.name}`
        : g.resource === "workspace"
          ? `Project ${item.project.name}`
          : g.resource === "asset"
            ? "Directly on this asset"
            : g.resourceId === objectId
              ? "Directly on this collection"
              : `Collection ${names.find((n) => n.id === g.resourceId)?.name ?? ""}`;
    return g.group ? `Group ${g.group}, on ${on.charAt(0).toLowerCase()}${on.slice(1)}` : on;
  };
  const best = new Map<string, Holder>();
  for (const g of found) {
    // Private: the organization's and the project's roles reach it only as admin.
    if (obj.private && (g.resource === "organization" || g.resource === "workspace") && g.scope !== "admin") continue;
    const had = best.get(g.userId);
    if (had && highest(had.scope, g.scope) === had.scope) continue;
    best.set(g.userId, { kind: "person", who: g.name || g.email, role: roleName(g.scope), scope: g.scope, via: via(g) });
  }
  const holders = [...best.values()];
  if (!who) {
    const keys = await db
      .select({ name: apiKeys.name, scope: apiKeys.scope, userId: apiKeys.userId, person: users.name })
      .from(apiKeys)
      .leftJoin(users, eq(users.id, apiKeys.userId))
      .where(eq(apiKeys.workspaceId, item.project.id));
    for (const k of keys)
      holders.push({
        kind: "agent",
        who: k.name,
        role: roleName(k.scope),
        scope: k.scope,
        via: k.userId ? `Agent key on ${item.project.name}, capped at ${k.person}` : `Agent key on ${item.project.name}`,
      });
    holders.push(...(await delivery(objectType, objectId)));
  }
  return { id: item.id, name: item.name, private: obj.private, holders };
}

/** The other door: who receives it without a grant. */
async function delivery(type: CatalogType, id: string): Promise<Holder[]> {
  const out: Holder[] = [];
  const pub = (who: string, via: string, kind: Holder["kind"] = "public") => out.push({ kind, who, role: "Viewer", scope: null, via });
  if (type === "asset") {
    const [a] = await db.select({ public: assets.public }).from(assets).where(eq(assets.id, id));
    if (a?.public) pub("Anyone with the link", "Public asset: approved, current, unexpired only");
  }
  if (type === "portal") {
    const [p] = await db.select({ access: portals.access }).from(portals).where(eq(portals.id, id));
    if (p) pub(p.access === "public" ? "Anyone" : p.access === "password" ? "Anyone with the password" : "Members and approved requests", `Portal access: ${p.access}`);
  }
  if (type === "asset" || type === "collection") {
    const links = await db
      .select({ name: shareLinks.name })
      .from(shareLinks)
      .where(and(eq(shareLinks.kind, "view"), type === "asset" ? eq(shareLinks.assetId, id) : eq(shareLinks.collectionId, id)));
    for (const l of links) pub(l.name ? `Holders of the link "${l.name}"` : "Holders of a view link", "Share link", "link");
  }
  return out;
}

export type ActivityLine = { at: Date; who: string; what: string; agent: boolean };

/** What happened to it, newest first: an asset's history across its versions, a brand's edits and releases. */
export async function objectActivity(caller: Caller, ref: string, limit = 30): Promise<ActivityLine[] | null> {
  const item = await findObject(caller, ref);
  if (!item) return null;
  const id = item.parent?.id ?? item.id;
  const type = item.parent?.type ?? item.type;
  if (type === "asset") {
    const stack = db.select({ s: sql`coalesce(${assets.stackId}, ${assets.id})` }).from(assets).where(eq(assets.id, id));
    const list = await db
      .select({ at: activity.at, who: activity.actor, verb: activity.verb, agent: activity.agent, detail: activity.detail })
      .from(activity)
      .where(inArray(activity.assetId, db.select({ id: assets.id }).from(assets).where(or(eq(assets.id, id), eq(assets.stackId, sql`(${stack})`)))))
      .orderBy(desc(activity.at))
      .limit(limit);
    return list.map((a) => ({ at: a.at, who: a.who, agent: a.agent, what: `${a.verb.replaceAll("_", " ")}${a.detail?.version ? ` @${a.detail.version}` : ""}${a.detail?.note ? `: "${a.detail.note}"` : ""}` }));
  }
  if (type === "brand") {
    const list = await db
      .select({ at: brandVersions.updatedAt, number: brandVersions.number, actor: brandVersions.actor, publishedAt: brandVersions.publishedAt, publishedBy: brandVersions.publishedBy, note: brandVersions.note, changed: brandVersions.changed })
      .from(brandVersions)
      .where(eq(brandVersions.brandId, id))
      .orderBy(desc(brandVersions.number))
      .limit(limit);
    return list.flatMap((v) => [
      ...(v.publishedAt ? [{ at: v.publishedAt, who: v.publishedBy ?? v.actor, agent: false, what: `released @${v.number}${v.note ? `: "${v.note}"` : ""}` }] : []),
      { at: v.at, who: v.actor, agent: false, what: v.changed.length ? `edited ${v.changed.slice(0, 3).join(", ")}${v.changed.length > 3 ? ` and ${v.changed.length - 3} more` : ""}` : "edited it" },
    ]);
  }
  return [{ at: item.createdAt, who: "", agent: false, what: "created it" }];
}
