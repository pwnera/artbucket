import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BrandScore } from "@/components/brand-score";
import { TabSkeleton } from "@/components/skeletons";
import { brandHead } from "@/lib/brand-head";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const head = await brandHead((await params).slug);
  return { title: head ? `${head.brand.name} Agent Score` : "Agent Score" };
}

/** A brand's Brand Agent Score, from GET /api/v1/brands/{slug}/status: opened from its Overview. */
export default function BrandScorePage({ params }: Props) {
  return (
    <Suspense fallback={<TabSkeleton width="3xl" />}>
      <Tab params={params} />
    </Suspense>
  );
}

async function Tab({ params }: Props) {
  const { slug } = await params;
  const head = await brandHead(slug);
  if (!head?.status) notFound();
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-16 md:px-6">
      <BrandScore name={head.brand.name} slug={slug} status={head.status} />
    </div>
  );
}
