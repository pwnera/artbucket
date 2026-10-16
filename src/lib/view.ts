/**
 * The library's view as a URL: what the page shows is `/?{query}`, so any
 * view can be linked, bookmarked, reloaded and gone back to. The query is the
 * /api/v1/assets query string, plus one key only the page reads: `asset`
 * (the one open).
 *
 * Pure, so `pnpm test` runs it under plain Node.
 */
export type View = {
  q: string;
  tags: string[];
  /** Asset types; they OR together. */
  types: string[];
  /** Lifecycle states (lib/lifecycle.ts); they OR together, and none means approved. */
  status: string[];
  collection: string | null;
  review: boolean;
  /** Values per select/boolean field; values of one field OR together. */
  filters: Record<string, string[]>;
  /** Params the UI has no control for (ranges from a saved search): kept, shown, removable. */
  extra: [string, string][];
  asset: string | null;
};

export function parseView(params: URLSearchParams): View {
  const filters: Record<string, string[]> = {};
  const extra: [string, string][] = [];
  for (const [k, v] of params) {
    const m = k.match(/^f\.([a-z0-9_]+)$/);
    if (m) (filters[m[1]] ??= []).push(v);
    else if (k.startsWith("f.")) extra.push([k, v]);
  }
  return {
    q: params.get("q") ?? "",
    tags: params.getAll("tag"),
    types: params.getAll("type"),
    status: params.getAll("status"),
    collection: params.get("collection"),
    // `/?review` as well as `/?review=true`: the short form is what people type.
    review: params.has("review") && params.get("review") !== "false",
    filters,
    extra,
    asset: params.get("asset"),
  };
}

/**
 * The view back to a query string, always in the same order, so a saved
 * search matches the view it was saved from. `ui: false` leaves out what only
 * the page reads: that is the API query.
 */
export function viewQuery(v: View, ui = true): string {
  const p = new URLSearchParams();
  if (v.q.trim()) p.set("q", v.q.trim());
  for (const t of v.tags) p.append("tag", t);
  for (const t of v.types) p.append("type", t);
  for (const s of v.status) p.append("status", s);
  if (v.collection) p.set("collection", v.collection);
  if (v.review) p.set("review", "true");
  for (const [k, vs] of Object.entries(v.filters)) for (const x of vs) p.append(`f.${k}`, x);
  for (const [k, x] of v.extra) p.append(k, x);
  if (ui && v.asset) p.set("asset", v.asset);
  return p.toString();
}

/** A saved search's query, in the same canonical form as `viewQuery`. */
export const canonical = (query: string) => viewQuery(parseView(new URLSearchParams(query)), false);

/** Narrowed by something other than where you are (a collection, the review queue). */
export const isNarrowed = (v: View) =>
  v.q.trim() !== "" || v.tags.length > 0 || v.types.length > 0 || v.status.length > 0 || v.extra.length > 0 || Object.values(v.filters).some((x) => x.length > 0);

/**
 * Explore's search box with words (not Assets' plain grid, a collection or
 * Review), where something besides assets may match: its search of every
 * type (components/catalog-matches.tsx) is the one Insights records, not
 * the assets' beside it.
 */
export const explored = (v: View, browse: boolean) => !browse && !v.collection && !v.review && !!v.q.trim() && !!narrowOf(v);

/** Explore's filters as the catalog reads them (GET /api/v1/catalog): its tags, and its asset states as the catalog's statuses. */
export type Narrow = { tags: string[]; statuses: ("draft" | "in_review" | "current" | "archived")[] };

/** An asset state as the catalog's lifecycle says it (lib/db/schema.ts catalog_objects); expired and deleted have none of their own. */
const STATUS_OF: Record<string, Narrow["statuses"][number]> = { draft: "draft", proposed: "in_review", active: "current", archived: "archived", rejected: "archived" };

/** The catalog's statuses back as the view's asset states, which the URL keeps: what Explore's Status filter writes. */
export const statesOf = (statuses: string[]) => [...new Set(statuses.flatMap((s) => Object.entries(STATUS_OF).find(([, c]) => c === s)?.[0] ?? []))];

/**
 * The view's facets, for every type Explore finds beside assets, or null when
 * they leave nothing but assets: a file type, a custom field, or only states
 * no other type has.
 */
export function narrowOf(v: View): Narrow | null {
  if (v.types.length || v.extra.length || Object.values(v.filters).some((x) => x.length)) return null;
  const statuses = [...new Set(v.status.flatMap((s) => STATUS_OF[s] ?? []))];
  if (v.status.length && !statuses.length) return null;
  return { tags: v.tags, statuses };
}
