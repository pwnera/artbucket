import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, portals } from "@/lib/db/schema";
import { recordAudit } from "@/lib/core/audit";
import { env } from "@/lib/env";
import { postPublic } from "@/lib/fetch-public";
import { unseal } from "@/lib/settings";

/**
 * A brand released reaches the sites built from it (PRD part 2, SITE-14):
 * each site whose rebuild hook follows the brand has its hook called with the
 * release, so Vercel, Netlify, Cloudflare Pages or a CI job builds it again,
 * wherever it is hosted. Assets and tokens on /c/ already follow without a
 * build; this is for the text a build bakes in.
 *
 * Called after a release is saved, never in its way: a hook that is slow or
 * down leaves the release as it is, and says so on the site. What each hook
 * answered, how many were called.
 */
export async function rebuildSites(brandId: string, release: { number: number; note?: string | null }) {
  const sites = await db
    .select({ id: portals.id, slug: portals.slug, name: portals.name, projectId: portals.projectId, hook: portals.rebuildHook, brand: brands.slug })
    .from(portals)
    .innerJoin(brands, eq(brands.id, portals.rebuildBrandId))
    .where(and(eq(portals.rebuildBrandId, brandId), isNotNull(portals.rebuildHook)));
  const results = await Promise.all(
    sites.map(async (s) => {
      const url = unseal(s.hook!, env.BETTER_AUTH_SECRET);
      let status: string;
      try {
        if (!url) throw new Error("The hook can't be read: set it again");
        const code = await postPublic(url, { event: "brand.released", brand: s.brand, release: release.number, note: release.note ?? null, site: s.slug });
        status = String(code);
      } catch (err) {
        status = err instanceof Error ? err.message : "It could not be called";
      }
      await db.update(portals).set({ rebuiltAt: new Date(), rebuildStatus: status }).where(eq(portals.id, s.id));
      await recordAudit({ actor: "server" }, "site.rebuilt", s.name, { brand: s.brand, release: release.number, status }, { projectId: s.projectId });
      return { site: s.slug, status };
    }),
  );
  return results;
}
