import { and, asc, count, desc, eq, gt, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { brandRules, brands, brandVersions, organizations, portalBrands, portals, workspaces, type Visibility } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { recordAudit } from "@/lib/core/audit";
import { AssetError } from "@/lib/core/errors";
import { pullCounts } from "@/lib/core/events";
import { env } from "@/lib/env";
import { hubHome, hubPath } from "@/lib/hub";

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
  visibility: b.visibility,
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

// ---- BrandHub: who sees the brand there (lib/core/hub.ts reads it) ------------------

/** A portal open to anyone: public, and not closed. */
export const publicDoor = and(eq(portals.access, "public"), or(isNull(portals.expiresAt), gt(portals.expiresAt, sql`now()`)));

/**
 * The portal BrandHub links as the brand's guidelines: the one chosen while
 * it still shows the brand, else its first public, open portal by name.
 */
export async function guidelinesPortal(b: Pick<Brand, "id" | "hubPortalId">) {
  const rows = await db
    .select({ id: portals.id, slug: portals.slug, name: portals.name, open: sql<boolean>`${publicDoor}` })
    .from(portalBrands)
    .innerJoin(portals, eq(portals.id, portalBrands.portalId))
    .where(eq(portalBrands.brandId, b.id))
    .orderBy(asc(portals.name));
  return rows.find((r) => r.id === b.hubPortalId) ?? rows.find((r) => r.open) ?? null;
}

/**
 * The brand on BrandHub: who sees it, where (`url`, null with no hub), and
 * whether there is anything to see (`published`: the hub shows the latest
 * publish, so a brand never published shows nowhere).
 */
export async function hubOf(b: Brand) {
  if (!env.HUB_URL) return null;
  const [[o], [v], pulls] = await Promise.all([
    db
      .select({ org: organizations.slug })
      .from(workspaces)
      .innerJoin(organizations, eq(organizations.id, workspaces.organizationId))
      .where(eq(workspaces.id, b.workspaceId)),
    db
      .select({ number: brandVersions.number, publishedAt: brandVersions.publishedAt })
      .from(brandVersions)
      .where(and(eq(brandVersions.brandId, b.id), isNotNull(brandVersions.publishedAt)))
      .orderBy(desc(brandVersions.number))
      .limit(1),
    pullCounts([b.id]),
  ]);
  const path = hubPath(o.org, b.slug);
  return {
    visibility: b.visibility,
    // A private brand's page is for its people: where they are signed in (lib/hub.ts hubHome).
    url: hubHome(b.visibility, env.APP_URL, env.HUB_URL) + path,
    published: v ? { number: v.number, publishedAt: v.publishedAt! } : null,
    portal: await guidelinesPortal(b).then((p) => p && { slug: p.slug, name: p.name }),
    chosen: !!b.hubPortalId,
    /** Its BrandHub files read in the last 30 days, what its hub card shows. */
    pulls: pulls.get(b.id) ?? 0,
    /** Taken off the hub by whoever runs the server, and why: it can't be made public until they lift it. */
    delisted: b.hubDelisted,
  };
}

/**
 * Make the brand public on BrandHub, or private again, and pick the portal it
 * links as its guidelines (a slug of one showing it; null: its first public
 * one). Public takes a publish, since readers get the latest, and a slug no
 * other public brand of the organization has: `{org}/{brand}` names one.
 */
export async function setHub(caller: Caller, slug: string, patch: { visibility?: Visibility; portal?: string | null }) {
  if (!env.HUB_URL) throw new AssetError("invalid", "This server has no BrandHub (HUB_URL)");
  const b = await resolveBrand(caller.workspace.id, slug);
  let hubPortalId = b.hubPortalId;
  if (patch.portal !== undefined) {
    if (patch.portal === null) hubPortalId = null;
    else {
      const [p] = await db
        .select({ id: portals.id })
        .from(portals)
        .innerJoin(portalBrands, and(eq(portalBrands.portalId, portals.id), eq(portalBrands.brandId, b.id)))
        .where(and(eq(portals.slug, patch.portal), eq(portals.workspaceId, b.workspaceId)));
      if (!p) throw new AssetError("invalid", `portal: no portal "${patch.portal}" shows ${b.name}`);
      hubPortalId = p.id;
    }
  }
  const visibility = patch.visibility ?? b.visibility;
  if (visibility === "public" && b.hubDelisted) {
    throw new AssetError("forbidden", `Taken off BrandHub by whoever runs this server: ${b.hubDelisted}. Ask them to list it again`);
  }
  if (visibility === "public" && b.visibility !== "public") {
    const [v] = await db
      .select({ n: brandVersions.number })
      .from(brandVersions)
      .where(and(eq(brandVersions.brandId, b.id), isNotNull(brandVersions.publishedAt)))
      .limit(1);
    if (!v) throw new AssetError("invalid", "Publish it first: BrandHub shows a brand's latest publish");
    const [twin] = await db
      .select({ name: brands.name })
      .from(brands)
      .innerJoin(workspaces, eq(workspaces.id, brands.workspaceId))
      .where(and(eq(workspaces.organizationId, caller.workspace.organizationId), eq(brands.slug, b.slug), ne(brands.id, b.id), eq(brands.visibility, "public")));
    if (twin) throw new AssetError("conflict", `${twin.name}, in another workspace, is public as ${b.slug} already. Rename one of them`);
  }
  const [row] = await db.update(brands).set({ visibility, hubPortalId }).where(eq(brands.id, b.id)).returning();
  if (visibility !== b.visibility) await recordAudit(caller, visibility === "public" ? "brand.public" : "brand.private", b.name, { brand: b.slug });
  return (await hubOf(row))!;
}
