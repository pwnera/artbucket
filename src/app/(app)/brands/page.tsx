import type { Metadata } from "next";
import { BrandsPage, type BrandHub, type BrandRow } from "@/components/brands";
import { can } from "@/lib/permissions";
import { brands as listBrands, get, whoami } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Brands" };

/** The workspace's brands and who sees each on BrandHub, from /api/v1/brands and each one's /hub like any client's. */
export default async function Brands({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [me, list, { q }] = await Promise.all([whoami(), listBrands(), searchParams]);
  const hubs = await Promise.all(list.map((b) => get(`brands/${encodeURIComponent(b.slug)}/hub`, (x: { data: BrandHub }) => x.data, null)));
  const rows = list.map((b, i) => ({ ...b, hub: hubs[i] })) as BrandRow[];
  return <BrandsPage brands={rows} canShare={can(me, "brand.publish")} canEdit={can(me, "brand.edit")} q={q} />;
}
