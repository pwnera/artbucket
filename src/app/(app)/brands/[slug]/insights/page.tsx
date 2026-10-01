import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BrandHeader } from "@/components/brand-header";
import { BrandInsights, type BrandInsightsData } from "@/components/brand-insights";
import { AppHeader } from "@/components/page";
import { brandHead } from "@/lib/brand-head";
import { env } from "@/lib/env";
import { can } from "@/lib/permissions";
import { get, whoami } from "@/lib/sidebar";
import { brandPath } from "@/lib/site";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const head = await brandHead((await params).slug);
  return { title: head ? `${head.brand.name} insights` : "Insights" };
}

/** A brand's Insights tab: release adoption and this week's answers, from GET /api/v1/brands/{slug}/insights. */
export default async function BrandInsightsPage({ params }: Props) {
  const { slug } = await params;
  const [head, me, data] = await Promise.all([
    brandHead(slug),
    whoami(),
    get(`brands/${encodeURIComponent(slug)}/insights`, (x: { data: BrandInsightsData }) => x.data, null),
  ]);
  if (!head) notFound();
  if (!can(me, "insights.read")) redirect(brandPath(slug));
  const { brand, rules, status, release } = head;
  return (
    <>
      <AppHeader trail={[{ label: "Brands", href: "/brands" }, { label: brand.name, href: brandPath(slug) }, { label: "Insights" }]} />
      <BrandHeader brand={brand} origin={env.APP_URL} rules={rules} status={status} release={release} at="insights" />
      <div className="mx-auto w-full max-w-5xl px-4 pt-6 pb-16 md:px-6">
        <BrandInsights data={data} />
      </div>
    </>
  );
}
