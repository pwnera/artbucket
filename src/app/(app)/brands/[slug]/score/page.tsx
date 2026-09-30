import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandHeader } from "@/components/brand-header";
import { BrandScore } from "@/components/brand-score";
import { AppHeader } from "@/components/page";
import { brandHead } from "@/lib/brand-head";
import { env } from "@/lib/env";
import { brandPath } from "@/lib/site";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const head = await brandHead((await params).slug);
  return { title: head ? `${head.brand.name} Agent Score` : "Agent Score" };
}

/** A brand's Brand Agent Score, from GET /api/v1/brands/{slug}/status: opened from its Overview. */
export default async function BrandScorePage({ params }: Props) {
  const { slug } = await params;
  const head = await brandHead(slug);
  if (!head?.status) notFound();
  const { brand, rules, status, release } = head;
  return (
    <>
      <AppHeader trail={[{ label: "Brands", href: "/brands" }, { label: brand.name, href: brandPath(slug) }, { label: "Agent Score" }]} />
      <BrandHeader brand={brand} origin={env.APP_URL} rules={rules} hub={status.hub} release={release} at="overview" />
      <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-16 md:px-6">
        <BrandScore name={brand.name} slug={slug} status={status} />
      </div>
    </>
  );
}
