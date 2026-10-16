import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { savedSearches } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { parseAssetQuery } from "@/lib/core/assets";
import { AssetError } from "@/lib/core/errors";
import { CATALOG_TYPES } from "@/lib/catalog";

/** Paging is where you are in the results, not what you searched for. */
const NOT_SAVED = new Set(["limit", "offset"]);

export async function listSearches(ws: string) {
  return db
    .select({ id: savedSearches.id, name: savedSearches.name, query: savedSearches.query, createdAt: savedSearches.createdAt })
    .from(savedSearches)
    .where(eq(savedSearches.projectId, ws))
    .orderBy(asc(savedSearches.name));
}

/**
 * Save a query string for /api/v1/assets, and Explore's type tab (`in`) if
 * it has one. It is parsed first, so a search that
 * saves is a search that runs; stored with its parameters sorted, so the same
 * search written two ways reads the same.
 *
 * A saved search can still go stale: a field it filters on can be deleted
 * later. Running it then returns the same 422 as any bad query.
 */
export async function saveSearch(caller: Caller, input: { name: string; query: string }) {
  const params = new URLSearchParams(input.query.replace(/^\?/, ""));
  for (const k of NOT_SAVED) params.delete(k);
  await parseAssetQuery(caller, params);
  // Explore's type tab, kept so the search opens on it (lib/view.ts); asset search itself ignores it.
  const tab = params.get("in");
  if (tab !== null && !(CATALOG_TYPES as readonly string[]).includes(tab)) throw new AssetError("invalid", `No type "${tab}" to open on. Types: ${CATALOG_TYPES.join(", ")}`);
  params.sort();
  const [row] = await db
    .insert(savedSearches)
    .values({ projectId: caller.project.id, name: input.name, query: params.toString() })
    .returning({ id: savedSearches.id, name: savedSearches.name, query: savedSearches.query, createdAt: savedSearches.createdAt });
  return row;
}

export async function deleteSearch(ws: string, id: string) {
  const gone = await db
    .delete(savedSearches)
    .where(and(eq(savedSearches.id, id), eq(savedSearches.projectId, ws)))
    .returning();
  return gone.length > 0;
}
