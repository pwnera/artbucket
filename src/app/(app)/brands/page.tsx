import type { Metadata } from "next";
import { BrandsPage, type BrandHub, type BrandRow } from "@/components/brands";
import { logoOf, swatches, tintOf, type HubRule } from "@/lib/hub";
import { can } from "@/lib/permissions";
import { brands as listBrands, get, whoami } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Brands" };

/** The workspace's brands and who sees each on BrandHub, from /api/v1/brands and each one's /hub like any client's. */
export default async function Brands({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [me, list, { q }] = await Promise.all([whoami(), listBrands(), searchParams]);
  type Rule = Pick<HubRule, "key" | "type" | "value" | "context"> & { assets: { id: string; mime: string }[] };
  const [hubs, rules] = await Promise.all([
    Promise.all(list.map((b) => get(`brands/${encodeURIComponent(b.slug)}/hub`, (x: { data: BrandHub }) => x.data, null))),
    // Each brand's look for its card: its colors, the color it is tinted with, and its mark.
    Promise.all(list.map((b) => get(`brand/rules?brand=${encodeURIComponent(b.slug)}`, (x: { data: Rule[] }) => x.data, [] as Rule[]))),
  ]);
  const rows = list.map((b, i) => {
    const logo = logoOf(rules[i]);
    return { ...b, hub: hubs[i], look: { swatches: swatches(rules[i]), tint: tintOf(rules[i]), logo: logo ? `/a/${logo.id}/w_320,f_webp` : null } };
  }) as BrandRow[];
  return <BrandsPage brands={rows} canShare={can(me, "brand.publish")} canEdit={can(me, "brand.edit")} q={q} />;
}
