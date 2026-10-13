import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, brandVersions, portals, projects, siteDeployments } from "@/lib/db/schema";
import { diffRules } from "@/lib/history";
import { recordAudit } from "@/lib/core/audit";
import { limitsOf } from "@/lib/core/usage";
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
 * down leaves the release as it is, and says so on the site. A site whose
 * builds say they read nothing the release changed isn't called at all
 * (unchangedSince). What each hook answered, or why it wasn't called.
 */
export async function rebuildSites(brandId: string, release: { number: number; note?: string | null }) {
  const sites = await db
    .select({ id: portals.id, slug: portals.slug, name: portals.name, projectId: portals.projectId, hook: portals.rebuildHook, brand: brands.slug, organizationId: projects.organizationId })
    .from(portals)
    .innerJoin(brands, eq(brands.id, portals.rebuildBrandId))
    .innerJoin(projects, eq(projects.id, portals.projectId))
    .where(and(eq(portals.rebuildBrandId, brandId), isNotNull(portals.rebuildHook)));
  const results = await Promise.all(
    sites.map(async (s) => {
      const url = unseal(s.hook!, env.BETTER_AUTH_SECRET);
      let status: string;
      try {
        // A plan without rebuilds (limits' `rebuilds`) keeps its hook, uncalled, and says why.
        const { features } = await limitsOf(s.organizationId);
        if (features && !features.includes("rebuilds")) {
          status = "skipped: rebuilding on release isn't in this organization's plan";
          await db.update(portals).set({ rebuiltAt: new Date(), rebuildStatus: status }).where(eq(portals.id, s.id));
          return { site: s.slug, status };
        }
        const since = await unchangedSince(s.id, brandId, release.number);
        // Nothing to call for: no build minutes spent on a release that changes nothing the site shows.
        if (since !== null) {
          status = `skipped: nothing it uses changed since release ${since}`;
          await db.update(portals).set({ rebuiltAt: new Date(), rebuildStatus: status }).where(eq(portals.id, s.id));
          return { site: s.slug, status };
        }
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

/** A manifest's `rules`: a key, `color.*` for every key under one, or `*` for all. */
const covers = (declared: string[], key: string) =>
  declared.some((d) => d === "*" || d === key || (d.endsWith(".*") && key.startsWith(d.slice(0, -1))));

/**
 * Whether a release changes nothing a site's live builds use (SITE-16): each
 * build's manifest names the release it was built from (`release`) and the
 * rules it reads (`rules`). When every live build here says both, and no rule
 * they read changed between that release and this one, the release they were
 * built from; null when the site should be built again, which is whenever a
 * build doesn't say. Assets follow on /c/ and are checked daily: a release
 * changes a site's text and values, which is what a build bakes in.
 */
async function unchangedSince(siteId: string, brandId: string, number: number): Promise<number | null> {
  const live = await db.select({ manifest: siteDeployments.manifest }).from(siteDeployments).where(and(eq(siteDeployments.siteId, siteId), eq(siteDeployments.state, "live")));
  if (!live.length) return null;
  const reads = live.map((d) => d.manifest as { release?: unknown; rules?: unknown } | null);
  if (reads.some((m) => typeof m?.release !== "number" || !Array.isArray(m.rules) || m.rules.some((k) => typeof k !== "string"))) return null;
  const from = Math.min(...reads.map((m) => m!.release as number));
  if (from >= number) return from;
  const [was, now] = await Promise.all(
    [from, number].map(async (n) => (await db.select({ snapshot: brandVersions.snapshot }).from(brandVersions).where(and(eq(brandVersions.brandId, brandId), eq(brandVersions.number, n))))[0]?.snapshot),
  );
  if (!was || !now) return null;
  const declared = reads.flatMap((m) => m!.rules as string[]);
  return diffRules(was, now).some((c) => covers(declared, c.key)) ? null : from;
}
