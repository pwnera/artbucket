import { and, asc, count, desc, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiKeys, brandRules, brands } from "@/lib/db/schema";
import { AssetError } from "@/lib/core/errors";
import type { Caller } from "@/lib/core/keys";

export type Brand = typeof brands.$inferSelect;

/** Who a change is by, as history shows it: the API key's name, or "web" for the app. */
export async function actorOf(caller: Caller) {
  if (!caller.key) return "web";
  const [k] = await db.select({ name: apiKeys.name }).from(apiKeys).where(eq(apiKeys.id, caller.key));
  return k?.name ?? "a revoked key";
}

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
export async function resolveBrand(slug?: string | null): Promise<Brand> {
  const [b] = await db
    .select()
    .from(brands)
    .where(slug ? eq(brands.slug, slug) : eq(brands.isDefault, true));
  if (!b) throw new AssetError("not_found", slug ? `No brand "${slug}"` : "There is no default brand");
  return b;
}

/** Every brand, the default first, with how many rules each has. */
export async function listBrands() {
  const rows = await db
    .select({ brand: brands, rules: count(brandRules.id) })
    .from(brands)
    .leftJoin(brandRules, eq(brandRules.brandId, brands.id))
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

export async function updateBrand(slug: string, patch: { name?: string; slug?: string; default?: true }) {
  const b = await resolveBrand(slug);
  return db.transaction(async (tx) => {
    if (patch.slug && patch.slug !== b.slug) {
      const [taken] = await tx.select({ id: brands.id }).from(brands).where(eq(brands.slug, patch.slug));
      if (taken) throw new AssetError("conflict", `A brand "${patch.slug}" exists`);
    }
    // One default: taking it means the old one lets go first.
    if (patch.default) await tx.update(brands).set({ isDefault: false }).where(and(eq(brands.isDefault, true), ne(brands.id, b.id)));
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
export async function deleteBrand(slug: string) {
  const b = await resolveBrand(slug);
  if (b.isDefault) throw new AssetError("conflict", "This is the default brand; make another one the default first");
  await db.delete(brands).where(eq(brands.id, b.id));
  return true;
}
