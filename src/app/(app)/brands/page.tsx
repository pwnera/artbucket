import type { Metadata } from "next";
import { BrandsPage, type BrandHub, type BrandRow } from "@/components/brands";
import type { HubOffer } from "@/components/hub-offers";
import { backgroundOf, headingFace, logoOf, paletteOf, tintOf, type HubRule } from "@/lib/hub";
import type { RuleSpec } from "@/lib/rules";
import { can } from "@/lib/permissions";
import { brands as listBrands, get, whoami } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Brands" };

/** The workspace's brands and who sees each on BrandHub, from /api/v1/brands and each one's /hub like any client's. */
export default async function Brands({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [me, list, { q }] = await Promise.all([whoami(), listBrands(), searchParams]);
  type Rule = Pick<HubRule, "key" | "label" | "type" | "value" | "context"> & { spec?: RuleSpec | null; assets: { id: string; mime: string; filename: string }[] };
  const [hubs, rules, offers] = await Promise.all([
    Promise.all(list.map((b) => get(`brands/${encodeURIComponent(b.slug)}/hub`, (x: { data: BrandHub }) => x.data, null))),
    // Each brand's look for its card: its mark, its colors, its ground and its heading face.
    Promise.all(list.map((b) => get(`brand/rules?brand=${encodeURIComponent(b.slug)}`, (x: { data: Rule[] }) => x.data, [] as Rule[]))),
    // Listings of other organizations that the organization's verified domains claim: a banner each, for its admins.
    can(me, "organization.manage") ? get("hub/offers", (x: { data: HubOffer[] }) => x.data, [] as HubOffer[]) : [],
  ]);
  const rows = list.map((b, i) => {
    const logo = logoOf(rules[i]);
    const look = {
      tint: tintOf(rules[i]),
      logo: logo ? `/a/${logo.id}/w_320,f_webp` : null,
      background: backgroundOf(rules[i]),
      palette: paletteOf(rules[i]),
      face: headingFace(rules[i], (a) => `/a/${a.id}`),
    };
    return { ...b, hub: hubs[i], look };
  }) as BrandRow[];
  return <BrandsPage brands={rows} canShare={can(me, "brand.publish")} canEdit={can(me, "brand.create")} q={q} offers={offers} />;
}
