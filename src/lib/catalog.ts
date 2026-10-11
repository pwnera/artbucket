/**
 * The catalog's words (PRD: Artbucket Catalog): its types, one lifecycle for
 * all of them, addresses, and the query language the app, REST, MCP and saved
 * searches share. lib/core/catalog.ts runs them against the catalog views.
 *
 * Pure, relative imports only: `pnpm test` runs this under plain Node.
 */

/** Objects: what a grant can be on and the explorer lists. */
export const OBJECT_TYPES = ["brand", "collection", "asset", "site"] as const;
/** Parts: addressed inside their object, found by search, governed by it. */
export const PART_TYPES = ["rule", "page"] as const;
export const CATALOG_TYPES = [...OBJECT_TYPES, ...PART_TYPES] as const;
export type ObjectType = (typeof OBJECT_TYPES)[number];
export type CatalogType = (typeof CATALOG_TYPES)[number];

export const TYPE_LABEL: Record<CatalogType, { one: string; many: string }> = {
  brand: { one: "Brand", many: "Brands" },
  collection: { one: "Collection", many: "Collections" },
  asset: { one: "Asset", many: "Assets" },
  site: { one: "Site", many: "Sites" },
  rule: { one: "Rule", many: "Rules" },
  page: { one: "Guideline page", many: "Guideline pages" },
};

export const isPart = (t: CatalogType) => (PART_TYPES as readonly string[]).includes(t);

/** A type by an older name, as addresses and saved queries may still say it: a portal is a site. */
const renamed = (t: string) => (t === "portal" ? "site" : t);

/** One lifecycle for every type. Expiring is a flag on current objects, not a status. */
export const STATUSES = ["draft", "in_review", "current", "replaced", "archived"] as const;
export type CatalogStatus = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<CatalogStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  current: "Current",
  replaced: "Replaced",
  archived: "Archived",
};

/** Lineage, upstream to downstream: what each edge says. */
export const EDGE_LABEL = {
  replaced_by: "replaced by",
  derived: "made into",
  rule: "a rule",
  member: "in",
  offered: "offered",
  fork: "forked",
  built: "built into",
} as const;
export type EdgeKind = keyof typeof EDGE_LABEL;

/** Days before the last day of use when a current object reads "expiring". */
export const EXPIRING_DAYS = 30;

/** A name as an address segment: "Press kit" is press-kit. The views' slugs, in JS. */
export const slugOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export type Address = { org: string; project: string; type: CatalogType; slug: string; release: number | null; part?: { type: CatalogType; slug: string } };

/**
 * {org}/{project}/{type}/{slug}[@release], and a part after its object:
 * acme/corporate/brand/acme/rule/logo.primary. Null when it isn't one.
 */
export function parseAddress(raw: string): Address | null {
  const segs = raw.trim().replace(/^\/+|\/+$/g, "").split("/");
  if (segs.length !== 4 && segs.length !== 6) return null;
  const [org, project, said, last, partType, partSlug] = segs;
  const type = renamed(said);
  if (!(OBJECT_TYPES as readonly string[]).includes(type)) return null;
  const at = last.match(/^(.+?)(?:@(\d+))?$/);
  if (!org || !project || !at) return null;
  const address: Address = { org, project, type: type as CatalogType, slug: at[1], release: at[2] ? Number(at[2]) : null };
  if (segs.length === 6) {
    if (!(PART_TYPES as readonly string[]).includes(partType) || !partSlug) return null;
    address.part = { type: partType as CatalogType, slug: partSlug };
  }
  return address;
}

export function formatAddress(a: { org: string; project: string; type: CatalogType; slug: string; release?: number | null; parent?: { type: CatalogType; slug: string } | null }) {
  const at = a.release ? `@${a.release}` : "";
  return a.parent ? `${a.org}/${a.project}/${a.parent.type}/${a.parent.slug}/${a.type}/${a.slug}` : `${a.org}/${a.project}/${a.type}/${a.slug}${at}`;
}

export type CatalogQuery = {
  words: string;
  types: CatalogType[];
  projects: string[];
  statuses: CatalogStatus[];
  tags: string[];
  uses: string[];
  usedBy: string[];
  /** "me", or a group's name later: objects they hold Admin on directly. */
  admin: string[];
};

const FILTERS = { type: "types", project: "projects", status: "statuses", tag: "tags", uses: "uses", usedby: "usedBy", admin: "admin" } as const;

/**
 * Free words plus filters: `logo type:asset,rule status:current uses:acme/corporate/brand/acme`.
 * A comma in a filter is "or". An unknown filter, type or status stays a word, so nothing typed is lost.
 */
export function parseQuery(q: string): CatalogQuery {
  const out: CatalogQuery = { words: "", types: [], projects: [], statuses: [], tags: [], uses: [], usedBy: [], admin: [] };
  const words: string[] = [];
  for (const token of q.trim().split(/\s+/).filter(Boolean)) {
    const m = token.match(/^([a-z]+):(.+)$/i);
    const key = m && (FILTERS as Record<string, keyof CatalogQuery>)[m[1].toLowerCase()];
    if (!m || !key) {
      words.push(token);
      continue;
    }
    const values = m[2].split(",").filter(Boolean).map((v) => (key === "types" ? renamed(v) : v));
    if (key === "types" && !values.every((v) => (CATALOG_TYPES as readonly string[]).includes(v))) words.push(token);
    else if (key === "statuses" && !values.every((v) => (STATUSES as readonly string[]).includes(v))) words.push(token);
    else (out[key] as string[]).push(...values);
  }
  out.words = words.join(" ");
  return out;
}

/** The query back as one string: what saved searches store and the search box shows. */
export function formatQuery(q: CatalogQuery) {
  const f = (k: string, v: string[]) => (v.length ? [`${k}:${v.join(",")}`] : []);
  return [
    q.words,
    ...f("type", q.types),
    ...f("project", q.projects),
    ...f("status", q.statuses),
    ...f("tag", q.tags),
    ...f("uses", q.uses),
    ...f("usedby", q.usedBy),
    ...f("admin", q.admin),
  ]
    .filter(Boolean)
    .join(" ");
}

/** A REST call's params as one query: `q` plus each filter by name, so ?q=logo&status=current is "logo status:current". */
export function queryFromParams(params: URLSearchParams): CatalogQuery {
  const parts = [params.get("q") ?? ""];
  for (const k of Object.keys(FILTERS)) for (const v of params.getAll(k)) parts.push(`${k}:${v}`);
  return parseQuery(parts.join(" "));
}

/** "6 things downstream, in 2 projects": the impact line's numbers in words. */
export function impactLine(name: string, things: number, projects: number) {
  if (!things) return `Nothing depends on ${name}: it can change freely.`;
  return `Changing ${name} reaches ${things} ${things === 1 ? "thing" : "things"} downstream, in ${projects} ${projects === 1 ? "project" : "projects"}.`;
}

/** Where the app shows it, in its own project (the proxy's `?project=` opens that one). */
export function openPath(item: { id: string; type: CatalogType; slug: string; parent: { slug: string } | null; project: { id: string } }) {
  const w = `project=${item.project.id}`;
  const brand = item.parent?.slug ?? "";
  switch (item.type) {
    case "asset":
      return `/assets/${item.id}?${w}`;
    case "collection":
      return `/?collection=${item.id}&${w}`;
    case "brand":
      return `/brands/${item.slug}?${w}`;
    case "site":
      return `/sites?edit=${item.id}&${w}`;
    case "rule":
      return `/brands/${brand}/rules?${w}`;
    case "page":
      return `/brands/${brand}/guidelines?page=${item.slug}&${w}`;
  }
}
