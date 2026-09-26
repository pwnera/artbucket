import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { savedSearches } from "@/lib/db/schema";
import { parseAssetQuery } from "@/lib/core/assets";

/** Paging is where you are in the results, not what you searched for. */
const NOT_SAVED = new Set(["limit", "offset"]);

export async function listSearches() {
  return db.select().from(savedSearches).orderBy(asc(savedSearches.name));
}

/**
 * Save a query string for /api/v1/assets. It is parsed first, so a search that
 * saves is a search that runs; stored with its parameters sorted, so the same
 * search written two ways reads the same.
 *
 * A saved search can still go stale: a field it filters on can be deleted
 * later. Running it then returns the same 422 as any bad query.
 */
export async function saveSearch(input: { name: string; query: string }) {
  const params = new URLSearchParams(input.query.replace(/^\?/, ""));
  for (const k of NOT_SAVED) params.delete(k);
  await parseAssetQuery(params);
  params.sort();
  const [row] = await db
    .insert(savedSearches)
    .values({ name: input.name, query: params.toString() })
    .returning();
  return row;
}

export async function deleteSearch(id: string) {
  const gone = await db.delete(savedSearches).where(eq(savedSearches.id, id)).returning();
  return gone.length > 0;
}
