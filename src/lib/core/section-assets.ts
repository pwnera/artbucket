import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { assets, savedSearches } from "@/lib/db/schema";
import { hiddenIn, workspaceById, type Caller } from "@/lib/core/access";
import { assetWhere, deliverableSql, notSuperseded, parseAssetQuery } from "@/lib/core/assets";
import { AssetError } from "@/lib/core/errors";
import { NO_OFF, NONE } from "@/lib/access";
import { collectionQuery, issues, type TEMPLATE_PROPS } from "@/lib/pages";
import { downloadsFor, type PortalPreset } from "@/lib/portal";
import { hasPreview } from "@/lib/preview";
import { isDownloadable } from "@/lib/rights";
import { withSignature } from "@/lib/signed";
import type { Media } from "@/lib/site";

/**
 * The assets brand pages show: one presented for a reader (portals present
 * theirs the same way), and a collection section's, live from the library.
 * Readers see only what may be used, whoever they are: approved, current,
 * unexpired and out of embargo (lib/lifecycle.ts deliverable).
 */

type AssetRow = typeof assets.$inferSelect;
/** The `s` for an asset, for a visitor without a session; null for members, whose session opens every URL. */
export type Sign = ((id: string) => string) | null;
type CollectionProps = z.output<(typeof TEMPLATE_PROPS)["collection"]>;

/** An asset as a page or a portal shows it, its URLs signed when `sign` is given. */
export function presentAsset(a: AssetRow, o: { sign: Sign; presets: PortalPreset[]; downloads?: boolean }): Media {
  const m = a.metadata ?? {};
  const still = hasPreview(a);
  const s = o.sign?.(a.id);
  // A member's session takes anything; a visitor, what may be handed out.
  const kept = !!o.sign && !isDownloadable(a);
  // On this host, not APP_URL: a portal on its own domain loads everything from there.
  const at = (rest = "") => (s ? withSignature(`/a/${a.id}${rest}`, s) : `/a/${a.id}${rest}`);
  return {
    id: a.id,
    filename: a.filename,
    title: m.title ?? null,
    description: m.description ?? null,
    creator: m.creator ?? null,
    copyright: m.copyright ?? null,
    mime: a.mime,
    size: a.size,
    width: a.width,
    height: a.height,
    thumbnail: still ? at("/w_640,f_webp") : null,
    preview: still ? at("/w_1600,f_webp") : null,
    original: at(),
    downloads: o.downloads === false || kept ? [] : downloadsFor(a, o.presets, "", s),
    focus: m.focus ?? null,
    ...(a.probe?.mono === true && { mono: true }),
    ...(kept && { kept: true as const }),
    updatedAt: a.updatedAt.toISOString(),
  };
}

/**
 * A reader of the workspace, never a person: the guest pattern of
 * core/shares.ts. Read on the workspace, so private collections and assets
 * stay out, plus read on the one collection a section names, so a private
 * collection its editor chose still shows, as portals do.
 */
export async function readerCaller(ws: string, collection?: string): Promise<Caller> {
  const [workspace, hidden] = await Promise.all([workspaceById(ws), hiddenIn(ws)]);
  if (!workspace) throw new AssetError("not_found", "No such workspace");
  return {
    workspace,
    scope: "read",
    narrow: collection ? { ...NONE, collections: { [collection]: "read" } } : NONE,
    off: NO_OFF,
    hidden,
    orgScope: null,
    actor: "reader",
    user: null,
    key: null,
    ip: null,
  };
}

const SORT = {
  newest: [desc(assets.createdAt)],
  oldest: [asc(assets.createdAt)],
  name: [asc(sql`coalesce(${assets.metadata} ->> 'title', ${assets.filename})`)],
};

/**
 * A collection section's assets: its collection or saved search, narrowed by
 * its query. A query that no longer parses (a field deleted, a collection
 * gone) is an `error`, not a failed page: the section shows empty, and
 * editors see why.
 *
 * `as`: a signed-in reader sees what they may see in the library, no more; a
 * section can't list a collection they can't open. Portal visitors, who have
 * no grants, read as the workspace's reader.
 *
 * ponytail: one query and one count per collection section; batch them when
 * pages carry more than a few.
 */
export async function collectionItems(ws: string, props: CollectionProps, o: { sign: Sign; presets: PortalPreset[]; as?: Caller }) {
  let where;
  try {
    const [saved] = props.search
      ? await db.select({ query: savedSearches.query }).from(savedSearches).where(and(eq(savedSearches.id, props.search), eq(savedSearches.workspaceId, ws)))
      : [{ query: null }];
    if (!saved) throw new AssetError("not_found", "Its saved search has been deleted");
    const caller = o.as ?? (await readerCaller(ws, props.collection));
    const q = await parseAssetQuery(caller, collectionQuery(saved.query, props));
    // Whatever the query asks, readers get what may be used and nothing under review. deliverableSql
    // also catches an embargo, which the state alone misses; a stack shows its current version only.
    where = and(assetWhere(caller, { ...q, status: [], review: false, proposedBy: undefined }), deliverableSql, notSuperseded);
  } catch (err) {
    if (err instanceof AssetError) return { items: [], total: 0, error: err.message };
    if (err instanceof z.ZodError) return { items: [], total: 0, error: issues(err, "query").join("; ") };
    throw err;
  }
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(assets)
      .where(where)
      .orderBy(...SORT[props.sort ?? "newest"])
      .limit(Math.min(props.limit ?? 24, 200)),
    db.select({ total: count() }).from(assets).where(where),
  ]);
  return { items: rows.map((a) => presentAsset(a, { ...o, downloads: props.downloads !== false })), total, error: null };
}
