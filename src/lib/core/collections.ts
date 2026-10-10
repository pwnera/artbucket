import { and, asc, eq, getTableColumns, inArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { assets, collectionAssets, collections } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { AssetError } from "@/lib/core/errors";
import { listFields } from "@/lib/core/fields";
import { dropGrants, keepReach } from "@/lib/core/people";
import { reach } from "@/lib/access";
import { can } from "@/lib/permissions";
import { describeIssues, fieldsValidator, type FieldValues } from "@/lib/fields";
import { allows } from "@/lib/scopes";

/**
 * Collections group assets and carry field values their members inherit.
 *
 * Inheritance is materialized: `assets.inherited` is recomputed here whenever
 * membership or a collection's values change, so search, filters and facets
 * read one row and never join. An asset's own `fields` win over inherited ones;
 * between collections, the oldest wins, so the answer never depends on order
 * of insertion into the join table.
 *
 * A caller sees the project's collections if it may read the project,
 * private ones aside unless it is admin, and those it has a grant on.
 */

export type Collection = Omit<typeof collections.$inferSelect, "projectId"> & { count: number };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Aliased and qualified by hand: drizzle leaves columns unqualified in a one-table select,
// and a bare "id" in here would be the asset's, not the collection's.
// Members not deleted, asked as "none of the few deleted": the partial index on deleted_at answers
// that without a lookup per member (194 ms to 9 ms for 100 collections of 1,000, docs: benchmarks).
const count = sql<number>`(select count(*)::int from ${collectionAssets} ca where ca.collection_id = "collections"."id" and not exists (select 1 from ${assets} a where a.id = ca.asset_id and a.deleted_at is not null))`;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { projectId: _ws, ...columns } = getTableColumns(collections);

/** `in ()` is not SQL: an id nothing has keeps an empty list valid. */
export const NO_ID = "00000000-0000-0000-0000-000000000000";

/** The project's collections this caller may see. */
const seen = (caller: Caller) => {
  const granted = inArray(collections.id, [...reach(caller, "read").collections, NO_ID]);
  return and(
    eq(collections.projectId, caller.project.id),
    allows(caller.scope, "admin") ? undefined : allows(caller.scope, "read") ? or(eq(collections.private, false), granted) : granted,
  );
};

export async function listCollections(caller: Caller): Promise<Collection[]> {
  return db
    .select({ ...columns, count })
    .from(collections)
    .where(seen(caller))
    .orderBy(asc(collections.name), asc(collections.createdAt));
}

export async function getCollection(caller: Caller, id: string): Promise<Collection | null> {
  const [c] = await db
    .select({ ...columns, count })
    .from(collections)
    .where(and(seen(caller), eq(collections.id, id)));
  return c ?? null;
}

/** A write on one collection: the project's write scope, or a grant on it. */
async function writable(caller: Caller, id: string) {
  const c = await getCollection(caller, id);
  if (c && !can(caller, "collection.edit", c)) throw new AssetError("forbidden", `You may only look at ${c.name}`);
  return c;
}

export async function createCollection(
  caller: Caller,
  input: { name: string; icon?: string | null; fields?: Record<string, unknown>; private?: boolean },
) {
  const ws = caller.project.id;
  const values = stripNulls(await validValues(ws, input.fields ?? {}));
  const row = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(collections)
      .values({ projectId: ws, name: input.name, icon: input.icon ?? null, fields: values, private: !!input.private })
      .returning(columns);
    if (row.private) await keepReach(caller, "collection", row.id, tx);
    return row;
  });
  return { ...row, count: 0 };
}

/** `fields` merges; null clears a value. Members are re-inherited in the same transaction. */
export async function updateCollection(
  caller: Caller,
  id: string,
  patch: { name?: string; icon?: string | null; fields?: Record<string, unknown>; private?: boolean },
): Promise<Collection | null> {
  if (!(await writable(caller, id))) return null;
  const values = patch.fields ? await validValues(caller.project.id, patch.fields) : null;
  const found = await db.transaction(async (tx) => {
    const [c] = await tx
      .update(collections)
      .set({
        ...(patch.name ? { name: patch.name } : {}),
        ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
        ...(patch.private !== undefined ? { private: patch.private } : {}),
        ...(values
          ? {
              fields: sql`jsonb_strip_nulls(${collections.fields} || ${JSON.stringify(values)}::jsonb)`,
            }
          : {}),
      })
      .where(eq(collections.id, id))
      .returning({ id: collections.id });
    if (c && values) await refresh(tx, membersOf(id));
    if (c && patch.private) await keepReach(caller, "collection", id, tx);
    return !!c;
  });
  return found ? getCollection(caller, id) : null;
}

/** Only one the caller sees and may delete: a private collection's id (sent to everyone in /me's `hidden`) is no key to it. */
export async function deleteCollection(caller: Caller, id: string): Promise<boolean> {
  const c = await getCollection(caller, id);
  if (!c) return false;
  if (!can(caller, "collection.delete", c)) throw new AssetError("forbidden", `You may not delete ${c.name}`);
  const ws = caller.project.id;
  return db.transaction(async (tx) => {
    const members = await tx
      .select({ id: collectionAssets.assetId })
      .from(collectionAssets)
      .where(eq(collectionAssets.collectionId, id));
    const gone = await tx
      .delete(collections)
      .where(and(eq(collections.id, id), eq(collections.projectId, ws)))
      .returning();
    if (!gone.length) return false;
    await dropGrants("collection", [id], tx);
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

/**
 * Add and remove members in one call. Unknown asset ids are a 404, not a
 * silent skip; so are assets the caller can't see, which it can't file.
 */
export async function setMembers(caller: Caller, id: string, change: { add?: string[]; remove?: string[] }) {
  const add = [...new Set(change.add ?? [])];
  const remove = [...new Set(change.remove ?? [])];
  if (!(await writable(caller, id))) throw new AssetError("not_found", "No such collection");
  if (!allows(caller.scope, "admin") && add.length) {
    const rows = await db
      .select({
        id: assets.id,
        private: assets.private,
        collections: sql<string[]>`coalesce((select jsonb_agg(ca.collection_id) from ${collectionAssets} ca where ca.asset_id = ${assets.id}), '[]'::jsonb)`,
      })
      .from(assets)
      .where(inArray(assets.id, add));
    if (rows.length !== add.length || rows.some((a) => !can(caller, "asset.read", a))) throw new AssetError("not_found", "No such asset");
  }
  return db.transaction(async (tx) => {
    await addMembers(tx, caller.project.id, [id], add);
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
export async function joinCollections(tx: Tx, ws: string, collectionIds: string[], assetId: string) {
  if (!collectionIds.length) return;
  await addMembers(tx, ws, collectionIds, [assetId]);
  await refresh(tx, eq(assets.id, assetId));
}

/**
 * What an asset in these collections would inherit, computed the same way as
 * `refresh`: oldest collection wins. Lets upload count inherited values toward
 * required fields before the asset exists.
 */
export async function inheritedFrom(ws: string, collectionIds: string[]): Promise<FieldValues> {
  const ids = [...new Set(collectionIds)];
  if (!ids.length) return {};
  const rows = await db
    .select()
    .from(collections)
    .where(and(eq(collections.projectId, ws), inArray(collections.id, ids)))
    .orderBy(asc(collections.createdAt), asc(collections.id));
  if (rows.length !== ids.length) throw new AssetError("not_found", "No such collection");
  return rows.reduceRight<FieldValues>((acc, c) => ({ ...acc, ...c.fields }), {});
}

async function addMembers(tx: Tx, ws: string, collectionIds: string[], assetIds: string[]) {
  if (!collectionIds.length || !assetIds.length) return;
  const found = await tx
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.projectId, ws), inArray(assets.id, assetIds)));
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
async function validValues(ws: string, values: Record<string, unknown>) {
  const defs = (await listFields(ws)).map((d) => ({ ...d, required: false }));
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
