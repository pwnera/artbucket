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
  v.q.trim() !== "" || v.tags.length > 0 || v.types.length > 0 || v.extra.length > 0 || Object.values(v.filters).some((x) => x.length > 0);
