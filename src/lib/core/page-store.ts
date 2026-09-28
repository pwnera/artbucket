import { asc, eq, sql } from "drizzle-orm";
import type { db } from "@/lib/db";
import { brandPages } from "@/lib/db/schema";
import { renameKey, type SnapPage } from "@/lib/pages";

/**
 * A brand's pages as rows, for core/brand.ts's history and core/pages.ts.
 * No checks here: callers validate, and run inside the brand's transaction.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Db = Tx | typeof db;
export type PageRow = typeof brandPages.$inferSelect;

export const PAGE_ORDER = [asc(brandPages.position), asc(brandPages.slug)];

/**
 * A row as history keeps it. A field at its default is left out (D5), so a
 * version from before the field reads the same, and deploying it makes no version.
 */
export function toSnap(p: PageRow): SnapPage {
  return {
    slug: p.slug,
    title: p.title,
    position: p.position,
    hidden: p.hidden,
    sections: p.sections,
    ...(p.parent && { parent: p.parent }),
    ...(p.eyebrow && { eyebrow: p.eyebrow }),
    ...(p.lede && { lede: p.lede }),
    ...(p.cover && { cover: p.cover }),
    ...(p.icon && { icon: p.icon }),
    ...(p.audience !== "everyone" && { audience: p.audience }),
    ...(p.tabs && { tabs: true as const }),
    ...(p.aliases.length > 0 && { aliases: p.aliases }),
    updatedAt: p.updatedAt.toISOString(),
  };
}

/** The brand's pages as history keeps them. */
export async function pageSnapshot(tx: Db, brandId: string): Promise<SnapPage[]> {
  const rows = await tx.select().from(brandPages).where(eq(brandPages.brandId, brandId)).orderBy(...PAGE_ORDER);
  return rows.map(toSnap);
}

/** Replace the brand's pages with these. A page keeps the time it last changed, when the snapshot has it. */
export async function writePages(tx: Tx, brandId: string, pages: SnapPage[]) {
  await tx.delete(brandPages).where(eq(brandPages.brandId, brandId));
  if (!pages.length) return;
  await tx.insert(brandPages).values(
    pages.map((p) => ({
      brandId,
      slug: p.slug,
      title: p.title,
      position: p.position,
      hidden: p.hidden,
      sections: p.sections,
      parent: p.parent ?? null,
      eyebrow: p.eyebrow ?? null,
      lede: p.lede ?? null,
      cover: p.cover ?? null,
      icon: p.icon ?? null,
      audience: p.audience ?? "everyone",
      tabs: p.tabs ?? false,
      aliases: p.aliases ?? [],
      ...(p.updatedAt && { updatedAt: new Date(p.updatedAt) }),
    })),
  );
}

/** A rule's key changed: every section that showed it (by key, item or background) shows it under its new name. */
export async function renameKeyInPages(tx: Tx, brandId: string, from: string, to: string) {
  const rows = await tx.select().from(brandPages).where(eq(brandPages.brandId, brandId));
  for (const p of rows) {
    const sections = renameKey(p.sections, from, to);
    if (sections) await tx.update(brandPages).set({ sections, updatedAt: sql`now()` }).where(eq(brandPages.id, p.id));
  }
}
