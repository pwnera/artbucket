import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { deliverableSql } from "@/lib/core/assets";
import { listRules, listVersions } from "@/lib/core/brand";
import { hubOf, listBrands, resolveBrand } from "@/lib/core/brands";
import { listPages } from "@/lib/core/pages";
import { portalsShowing } from "@/lib/core/portals";
import { env } from "@/lib/env";
import { can } from "@/lib/permissions";
import { publishState, readiness } from "@/lib/readiness";
import { isFont } from "@/lib/font";
import { isDownloadable } from "@/lib/rights";
import { guidelinesPath } from "@/lib/site";

/**
 * A brand's launch checklist (lib/readiness.ts) from what is stored: its
 * rules, pages, history and the portals showing it, which only someone who
 * manages portals is told. With every brand beside it, so an agent learns
 * the slugs from the same call. GET /api/v1/brands/{slug}/status and the
 * brand_status tool both answer this.
 */
export async function brandStatus(caller: Caller, slug?: string) {
  const ws = caller.workspace.id;
  const brand = await resolveBrand(ws, slug);
  const [rules, { pages }, versions, brands] = await Promise.all([
    listRules(ws, { brand: brand.slug }),
    listPages(ws, brand.slug),
    listVersions(ws, brand.slug),
    listBrands(ws),
  ]);
  const portals = can(caller, "portal.manage") ? await portalsShowing(ws, brand.id) : null;
  return {
    brand: { slug: brand.slug, name: brand.name, default: brand.isDefault },
    brands: brands.map((b) => ({ slug: b.slug, name: b.name, default: b.default })),
    ...readiness({ rules, theme: brand.theme, pages, versions, portals }),
    publish: publishState(versions),
    live: versions.find((v) => v.publishedAt)?.number ?? null,
    portals,
    hub: await hubOf(brand),
    files: await filesOut(ws, rules),
    url: `${env.APP_URL}${guidelinesPath(brand.slug)}`,
  };
}

/**
 * Its rules' files as people outside get them on its portals and BrandHub:
 * how many they may download, and which they only see (lib/rights.ts
 * isDownloadable). Release and sharing say so before it goes out.
 */
async function filesOut(ws: string, rules: { assets: { id: string }[] }[]) {
  const ids = [...new Set(rules.flatMap((r) => r.assets.map((a) => a.id)))];
  const rows = ids.length
    ? await db
        .select({ id: assets.id, filename: assets.filename, mime: assets.mime, rights: assets.rights, origin: assets.origin })
        .from(assets)
        .where(and(inArray(assets.id, ids), eq(assets.workspaceId, ws), deliverableSql))
    : [];
  const kept = rows.filter((a) => !isDownloadable(a));
  return {
    downloadable: rows.length - kept.length,
    shownOnly: kept.map((a) => ({ id: a.id, filename: a.filename, font: isFont(a.mime, a.filename) })),
  };
}
