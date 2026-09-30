import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandAssets, type BrandAsset } from "@/components/brand-assets";
import { BrandHeader } from "@/components/brand-header";
import { AppHeader } from "@/components/page";
import { brandHead } from "@/lib/brand-head";
import { env } from "@/lib/env";
import { get } from "@/lib/sidebar";
import { brandPath } from "@/lib/site";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const head = await brandHead((await params).slug);
  return { title: head ? `${head.brand.name} assets` : "Assets" };
}

/** A brand's Assets tab: the files its rules and pages use, read-only (GET /api/v1/brands/{slug}/assets). */
export default async function BrandAssetsPage({ params }: Props) {
  const { slug } = await params;
  const [head, files] = await Promise.all([brandHead(slug), get(`brands/${encodeURIComponent(slug)}/assets`, (x: { data: BrandAsset[] }) => x.data, null)]);
  if (!head) notFound();
  const { brand, rules, status, release } = head;
  return (
    <>
      <AppHeader trail={[{ label: "Brands", href: "/brands" }, { label: brand.name, href: brandPath(slug) }, { label: "Assets" }]} />
      <BrandHeader brand={brand} origin={env.APP_URL} rules={rules} hub={status?.hub ?? null} release={release} at="assets" />
      <div className="mx-auto w-full max-w-5xl px-4 pt-6 pb-16 md:px-6">
        <BrandAssets assets={files} />
      </div>
    </>
  );
}
