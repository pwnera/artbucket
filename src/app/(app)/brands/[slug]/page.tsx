import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandOverview, type BrandSignals, type Release } from "@/components/brand-overview";
import type { Status } from "@/components/builder/use-status";
import { env } from "@/lib/env";
import { can } from "@/lib/permissions";
import type { Rule } from "@/lib/rules";
import { brands, get, whoami } from "@/lib/sidebar";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

const find = async (slug: string) => (await brands()).find((b) => b.slug === slug);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const brand = await find((await params).slug);
  return { title: brand?.name ?? "Brand" };
}

/** A brand's Overview: its card, colors, latest release and signals, from /api/v1 like any client's. */
export default async function BrandOverviewPage({ params }: Props) {
  const { slug } = await params;
  const [brand, me] = await Promise.all([find(slug), whoami()]);
  if (!brand) notFound();
  const b = encodeURIComponent(slug);
  const [rules, status, versions, signals] = await Promise.all([
    get(`brand/rules?brand=${b}`, (x: { data: Rule[] }) => x.data, []),
    get(`brands/${b}/status`, (x: { data: Status }) => x.data, null),
    get(`brands/${b}/versions`, (x: { data: (Release & { publishedAt: string | null })[] }) => x.data, []),
    can(me, "insights.read") ? get(`brands/${b}/insights`, (x: { data: BrandSignals }) => x.data, null) : null,
  ]);
  const release = (versions.find((v) => v.publishedAt) as Release | undefined) ?? null;
  return <BrandOverview brand={brand} origin={env.APP_URL} rules={rules} status={status} release={release} signals={signals} />;
}
