import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReleaseList } from "@/components/brand-releases";
import { TabSkeleton } from "@/components/skeletons";
import { brandHead } from "@/lib/brand-head";
import type { Update } from "@/lib/history";
import { get } from "@/lib/sidebar";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const head = await brandHead((await params).slug);
  return { title: head ? `${head.brand.name} releases` : "Releases" };
}

/** A brand's Releases tab: what readers got, release by release (GET /api/v1/brands/{slug}/updates). */
export default function ReleasesPage({ params }: Props) {
  return (
    <Suspense fallback={<TabSkeleton body="list" />}>
      <Tab params={params} />
    </Suspense>
  );
}

async function Tab({ params }: Props) {
  const { slug } = await params;
  const [head, updates] = await Promise.all([brandHead(slug), get(`brands/${encodeURIComponent(slug)}/updates`, (x: { data: Update[] }) => x.data, [])]);
  if (!head) notFound();
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-6 pb-16 md:px-6">
      <ReleaseList slug={slug} updates={updates} pending={head.status?.publish === "behind"} />
    </div>
  );
}
