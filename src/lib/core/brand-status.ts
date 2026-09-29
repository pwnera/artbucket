import type { Caller } from "@/lib/core/access";
import { listRules, listVersions } from "@/lib/core/brand";
import { listBrands, resolveBrand } from "@/lib/core/brands";
import { listPages } from "@/lib/core/pages";
import { portalsShowing } from "@/lib/core/portals";
import { env } from "@/lib/env";
import { can } from "@/lib/permissions";
import { publishState, readiness } from "@/lib/readiness";

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
    ...readiness({ rules, pages, versions, portals }),
    publish: publishState(versions),
    portals,
    url: `${env.APP_URL}/brand?${new URLSearchParams({ brand: brand.slug })}`,
  };
}
