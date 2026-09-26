import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, collections, fields } from "@/lib/db/schema";
import { AssetError } from "@/lib/core/errors";
import type { FieldDef, FieldType } from "@/lib/fields";

const toDef = (f: typeof fields.$inferSelect): FieldDef => ({
  key: f.key,
  label: f.label,
  type: f.type,
  options: f.options,
  required: f.required,
});

export async function listFields(): Promise<FieldDef[]> {
  const rows = await db.select().from(fields).orderBy(asc(fields.position), asc(fields.createdAt));
  return rows.map(toDef);
}

export async function createField(input: FieldDef & { position: number }): Promise<FieldDef> {
  const [row] = await db.insert(fields).values(input).onConflictDoNothing().returning();
  if (!row) throw new AssetError("conflict", `A field with key "${input.key}" already exists`);
  return toDef(row);
}

export async function updateField(
  key: string,
  patch: { label?: string; options?: string[]; required?: boolean; position?: number },
): Promise<FieldDef | null> {
  const [current] = await db.select().from(fields).where(eq(fields.key, key));
  if (!current) return null;
  if (patch.options && current.type !== ("select" satisfies FieldType)) {
    throw new AssetError("invalid", "Only select fields take options");
  }
  if (!Object.keys(patch).length) return toDef(current);
  const [row] = await db.update(fields).set(patch).where(eq(fields.key, key)).returning();
  return toDef(row);
}

/**
 * Removes the definition and every value stored under it, in one transaction.
 * Values live in three places (own, collection, inherited); all three go.
 */
export async function deleteField(key: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const gone = await tx.delete(fields).where(eq(fields.key, key)).returning();
    if (!gone.length) return false;
    await tx
      .update(assets)
      .set({
        fields: sql`${assets.fields} - ${key}::text`,
        inherited: sql`${assets.inherited} - ${key}::text`,
      })
      .where(sql`${assets.fields} ? ${key} or ${assets.inherited} ? ${key}`);
    await tx
      .update(collections)
      .set({ fields: sql`${collections.fields} - ${key}::text` })
      .where(sql`${collections.fields} ? ${key}`);
    return true;
  });
}
