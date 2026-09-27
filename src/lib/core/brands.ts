import { and, asc, count, desc, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { brandRules, brands } from "@/lib/db/schema";
import { AssetError } from "@/lib/core/errors";

/** A workspace's brands. `ws` is the workspace id; scopes were checked by the route. */

export type Brand = typeof brands.$inferSelect;

/** "Acme Studio" to "acme-studio". */
export const slugify = (name: string) =>
  name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/** The brand a slug names, or the default one when there is no slug. A wrong slug is a 404. */
export async function resolveBrand(ws: string, slug?: string | null): Promise<Brand> {
  const [b] = await db
    .select()
    .from(brands)
    .where(and(eq(brands.workspaceId, ws), slug ? eq(brands.slug, slug) : eq(brands.isDefault, true)));
  if (!b) throw new AssetError("not_found", slug ? `No brand "${slug}"` : "There is no default brand");
  return b;
}

/** Every brand, the default first, with how many rules each has. */
export async function listBrands(ws: string) {
  const rows = await db
    .select({ brand: brands, rules: count(brandRules.id) })
    .from(brands)
    .leftJoin(brandRules, eq(brandRules.brandId, brands.id))
    .where(eq(brands.workspaceId, ws))
    .groupBy(brands.id)
    .orderBy(desc(brands.isDefault), asc(brands.name));
  return rows.map(({ brand, rules }) => ({ ...present(brand), rules }));
}

export const present = (b: Brand) => ({
  slug: b.slug,
  name: b.name,
  default: b.isDefault,
  createdAt: b.createdAt,
});

export async function updateBrand(ws: string, slug: string, patch: { name?: string; slug?: string; default?: true }) {
  const b = await resolveBrand(ws, slug);
  return db.transaction(async (tx) => {
    if (patch.slug && patch.slug !== b.slug) {
      const [taken] = await tx
        .select({ id: brands.id })
        .from(brands)
        .where(and(eq(brands.workspaceId, ws), eq(brands.slug, patch.slug)));
      if (taken) throw new AssetError("conflict", `A brand "${patch.slug}" exists`);
    }
    // One default: taking it means the old one lets go first.
    if (patch.default) {
      await tx
        .update(brands)
        .set({ isDefault: false })
        .where(and(eq(brands.workspaceId, ws), eq(brands.isDefault, true), ne(brands.id, b.id)));
    }
    const [row] = await tx
      .update(brands)
      .set({
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.slug !== undefined && { slug: patch.slug }),
        ...(patch.default && { isDefault: true }),
      })
      .where(eq(brands.id, b.id))
      .returning();
    return present(row);
  });
}

/** Deletes the brand, its rules and its history. The default can't go: make another the default first. */
export async function deleteBrand(ws: string, slug: string) {
  const b = await resolveBrand(ws, slug);
  if (b.isDefault) throw new AssetError("conflict", "This is the default brand; make another one the default first");
  await db.delete(brands).where(eq(brands.id, b.id));
  return true;
}
