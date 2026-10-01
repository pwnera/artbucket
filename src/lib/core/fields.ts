import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, collections, fields } from "@/lib/db/schema";
import { AssetError } from "@/lib/core/errors";
import type { FieldDef, FieldType } from "@/lib/fields";

/** A workspace's custom fields. `ws` is the workspace id; the scope was checked by the route. */

const toDef = (f: typeof fields.$inferSelect): FieldDef => ({
  key: f.key,
  label: f.label,
  type: f.type,
  options: f.options,
  required: f.required,
});

const byKey = (ws: string, key: string) => and(eq(fields.workspaceId, ws), eq(fields.key, key));

export async function listFields(ws: string): Promise<FieldDef[]> {
  const rows = await db.select().from(fields).where(eq(fields.workspaceId, ws)).orderBy(asc(fields.position), asc(fields.createdAt));
  return rows.map(toDef);
}

export async function createField(ws: string, input: FieldDef & { position: number }): Promise<FieldDef> {
  const [row] = await db.insert(fields).values({ ...input, workspaceId: ws }).onConflictDoNothing().returning();
  if (!row) throw new AssetError("conflict", `A field with key "${input.key}" already exists`);
  return toDef(row);
}

export async function updateField(
  ws: string,
  key: string,
  patch: { label?: string; options?: string[]; required?: boolean; position?: number },
): Promise<FieldDef | null> {
  const [current] = await db.select().from(fields).where(byKey(ws, key));
  if (!current) return null;
  if (patch.options && current.type !== ("select" satisfies FieldType)) {
    throw new AssetError("invalid", "Only select fields take options");
  }
  if (!Object.keys(patch).length) return toDef(current);
  const [row] = await db.update(fields).set(patch).where(byKey(ws, key)).returning();
  // Deleted since it was read.
  return row ? toDef(row) : null;
}

/**
 * Removes the definition and every value stored under it, in one transaction.
 * Values live in three places (own, collection, inherited); all three go.
 */
export async function deleteField(ws: string, key: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const gone = await tx.delete(fields).where(byKey(ws, key)).returning();
    if (!gone.length) return false;
    await tx
      .update(assets)
      .set({
        fields: sql`${assets.fields} - ${key}::text`,
        inherited: sql`${assets.inherited} - ${key}::text`,
      })
      .where(and(eq(assets.workspaceId, ws), sql`(${assets.fields} ? ${key} or ${assets.inherited} ? ${key})`));
    await tx
      .update(collections)
      .set({ fields: sql`${collections.fields} - ${key}::text` })
      .where(and(eq(collections.workspaceId, ws), sql`${collections.fields} ? ${key}`));
    return true;
  });
}
