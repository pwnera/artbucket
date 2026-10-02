import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BrandAssets, type BrandAsset } from "@/components/brand-assets";
import { TabSkeleton } from "@/components/skeletons";
import { brandHead } from "@/lib/brand-head";
import { get } from "@/lib/sidebar";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const head = await brandHead((await params).slug);
  return { title: head ? `${head.brand.name} assets` : "Assets" };
}

/** A brand's Assets tab: the files its rules and pages use, read-only (GET /api/v1/brands/{slug}/assets). */
export default function BrandAssetsPage({ params }: Props) {
  return (
    <Suspense fallback={<TabSkeleton body="grid" />}>
      <Tab params={params} />
    </Suspense>
  );
}

async function Tab({ params }: Props) {
  const { slug } = await params;
  const [head, files] = await Promise.all([brandHead(slug), get(`brands/${encodeURIComponent(slug)}/assets`, (x: { data: BrandAsset[] }) => x.data, null)]);
  if (!head) notFound();
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-6 pb-16 md:px-6">
      <BrandAssets assets={files} />
    </div>
  );
}
