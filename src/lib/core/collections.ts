import { asc, eq, getTableColumns, inArray, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { assets, collectionAssets, collections } from "@/lib/db/schema";
import { AssetError } from "@/lib/core/errors";
import { listFields } from "@/lib/core/fields";
import { describeIssues, fieldsValidator, type FieldValues } from "@/lib/fields";

/**
 * Collections group assets and carry field values their members inherit.
 *
 * Inheritance is materialized: `assets.inherited` is recomputed here whenever
 * membership or a collection's values change, so search, filters and facets
 * read one row and never join. An asset's own `fields` win over inherited ones;
 * between collections, the oldest wins, so the answer never depends on order
 * of insertion into the join table.
 */

export type Collection = typeof collections.$inferSelect & { count: number };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const count = sql<number>`(select count(*)::int from ${collectionAssets} where ${collectionAssets.collectionId} = ${collections.id})`;

export async function listCollections(): Promise<Collection[]> {
  return db
    .select({ ...getTableColumns(collections), count })
    .from(collections)
    .orderBy(asc(collections.name), asc(collections.createdAt));
}

export async function getCollection(id: string): Promise<Collection | null> {
  const [c] = await db
    .select({ ...getTableColumns(collections), count })
    .from(collections)
    .where(eq(collections.id, id));
  return c ?? null;
}

export async function createCollection(input: { name: string; fields?: Record<string, unknown> }) {
  const values = stripNulls(await validValues(input.fields ?? {}));
  const [c] = await db.insert(collections).values({ name: input.name, fields: values }).returning();
  return { ...c, count: 0 };
}

/** `fields` merges; null clears a value. Members are re-inherited in the same transaction. */
export async function updateCollection(
  id: string,
  patch: { name?: string; fields?: Record<string, unknown> },
): Promise<Collection | null> {
  const values = patch.fields ? await validValues(patch.fields) : null;
  const found = await db.transaction(async (tx) => {
    const [c] = await tx
      .update(collections)
      .set({
        ...(patch.name ? { name: patch.name } : {}),
        ...(values
          ? {
              fields: sql`jsonb_strip_nulls(${collections.fields} || ${JSON.stringify(values)}::jsonb)`,
            }
          : {}),
      })
      .where(eq(collections.id, id))
      .returning({ id: collections.id });
    if (c && values) await refresh(tx, membersOf(id));
    return !!c;
  });
  return found ? getCollection(id) : null;
}

export async function deleteCollection(id: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const members = await tx
      .select({ id: collectionAssets.assetId })
      .from(collectionAssets)
      .where(eq(collectionAssets.collectionId, id));
    const gone = await tx.delete(collections).where(eq(collections.id, id)).returning();
    if (!gone.length) return false;
    // The cascade already removed the memberships; recompute what's left.
    if (members.length)
      await refresh(
        tx,
        inArray(
          assets.id,
          members.map((m) => m.id),
        ),
      );
    return true;
  });
}

/** Add and remove members in one call. Unknown asset ids are a 404, not a silent skip. */
export async function setMembers(id: string, change: { add?: string[]; remove?: string[] }) {
  const add = [...new Set(change.add ?? [])];
  const remove = [...new Set(change.remove ?? [])];
  return db.transaction(async (tx) => {
    const [c] = await tx
      .select({ id: collections.id })
      .from(collections)
      .where(eq(collections.id, id));
    if (!c) throw new AssetError("not_found", "No such collection");
    await addMembers(tx, [id], add);
    if (remove.length) {
      await tx
        .delete(collectionAssets)
        .where(
          sql`${collectionAssets.collectionId} = ${id} and ${inArray(collectionAssets.assetId, remove)}`,
        );
    }
    const touched = [...add, ...remove];
    if (touched.length) await refresh(tx, inArray(assets.id, touched));
  });
}

/** Used by upload: join an asset to collections and inherit, inside the caller's transaction. */
export async function joinCollections(tx: Tx, collectionIds: string[], assetId: string) {
  if (!collectionIds.length) return;
  await addMembers(tx, collectionIds, [assetId]);
  await refresh(tx, eq(assets.id, assetId));
}

/**
 * What an asset in these collections would inherit, computed the same way as
 * `refresh`: oldest collection wins. Lets upload count inherited values toward
 * required fields before the asset exists.
 */
export async function inheritedFrom(collectionIds: string[]): Promise<FieldValues> {
  const ids = [...new Set(collectionIds)];
  if (!ids.length) return {};
  const rows = await db
    .select()
    .from(collections)
    .where(inArray(collections.id, ids))
    .orderBy(asc(collections.createdAt), asc(collections.id));
  if (rows.length !== ids.length) throw new AssetError("not_found", "No such collection");
  return rows.reduceRight<FieldValues>((acc, c) => ({ ...acc, ...c.fields }), {});
}

async function addMembers(tx: Tx, collectionIds: string[], assetIds: string[]) {
  if (!collectionIds.length || !assetIds.length) return;
  const found = await tx.select({ id: assets.id }).from(assets).where(inArray(assets.id, assetIds));
  if (found.length !== assetIds.length) throw new AssetError("not_found", "No such asset");
  await tx
    .insert(collectionAssets)
    .values(
      collectionIds.flatMap((collectionId) =>
        assetIds.map((assetId) => ({ collectionId, assetId })),
      ),
    )
    .onConflictDoNothing();
}

const membersOf = (id: string) =>
  sql`${assets.id} in (select ${collectionAssets.assetId} from ${collectionAssets} where ${collectionAssets.collectionId} = ${id})`;

/** Recompute `inherited` for the matching assets from their current collections. */
async function refresh(tx: Tx, where: SQL) {
  await tx
    .update(assets)
    .set({
      inherited: sql`coalesce((
        select jsonb_object_agg(s.key, s.value) from (
          select distinct on (e.key) e.key, e.value
          from ${collectionAssets} ca
          join ${collections} c on c.id = ca.collection_id
          cross join lateral jsonb_each(c.fields) e
          where ca.asset_id = ${assets.id}
          order by e.key, c.created_at, c.id
        ) s
      ), '{}'::jsonb)`,
    })
    .where(where);
}

/** Collection values are always partial: nothing is required of a collection. */
async function validValues(values: Record<string, unknown>) {
  const defs = (await listFields()).map((d) => ({ ...d, required: false }));
  const parsed = fieldsValidator(defs, "patch").safeParse(values);
  if (!parsed.success) {
    throw new AssetError(
      "invalid",
      `Collection fields: ${describeIssues(parsed.error)}`,
      z.treeifyError(parsed.error),
    );
  }
  return parsed.data;
}

const stripNulls = (v: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null)) as FieldValues;
