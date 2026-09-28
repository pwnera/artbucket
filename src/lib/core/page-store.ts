import { asc, eq, sql } from "drizzle-orm";
import type { db } from "@/lib/db";
import { brandPages } from "@/lib/db/schema";
import type { SnapPage } from "@/lib/pages";

/**
 * A brand's pages as rows, for core/brand.ts's history and core/pages.ts.
 * No checks here: callers validate, and run inside the brand's transaction.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Db = Tx | typeof db;

export const PAGE_ORDER = [asc(brandPages.position), asc(brandPages.slug)];

/** The brand's pages as history keeps them. */
export async function pageSnapshot(tx: Db, brandId: string): Promise<SnapPage[]> {
  const rows = await tx.select().from(brandPages).where(eq(brandPages.brandId, brandId)).orderBy(...PAGE_ORDER);
  return rows.map(({ slug, title, position, hidden, sections }) => ({ slug, title, position, hidden, sections }));
}

/** Replace the brand's pages with these. */
export async function writePages(tx: Tx, brandId: string, pages: SnapPage[]) {
  await tx.delete(brandPages).where(eq(brandPages.brandId, brandId));
  if (pages.length) await tx.insert(brandPages).values(pages.map((p) => ({ brandId, ...p })));
}

/** A rule's key changed: every section that showed it shows it under its new name. */
export async function renameKeyInPages(tx: Tx, brandId: string, from: string, to: string) {
  const rows = await tx.select().from(brandPages).where(eq(brandPages.brandId, brandId));
  for (const p of rows) {
    if (!p.sections.some((s) => s.keys.includes(from))) continue;
    const sections = p.sections.map((s) => ({ ...s, keys: s.keys.map((k) => (k === from ? to : k)) }));
    await tx.update(brandPages).set({ sections, updatedAt: sql`now()` }).where(eq(brandPages.id, p.id));
  }
}
