import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BrandThemeTab } from "@/components/brand-theme-tab";
import { TabSkeleton } from "@/components/skeletons";
import { brandHead } from "@/lib/brand-head";
import { getBody } from "@/lib/sidebar";
import type { PageView } from "@/lib/site";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const head = await brandHead((await params).slug);
  return { title: head ? `${head.brand.name} theme` : "Theme" };
}

/** A brand's Theme tab: the theme its pages are drawn with, from the view (GET /api/v1/brands/{slug}/view). */
export default function BrandThemePage({ params }: Props) {
  return (
    <Suspense fallback={<TabSkeleton />}>
      <Tab params={params} />
    </Suspense>
  );
}

async function Tab({ params }: Props) {
  const { slug } = await params;
  const [head, view] = await Promise.all([brandHead(slug), getBody<{ data?: PageView }>(`brands/${encodeURIComponent(slug)}/view?edit=1`)]);
  if (!head || !view?.data) notFound();
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-6 pb-16 md:px-6">
      <BrandThemeTab slug={head.brand.slug} theme={view.data.theme} behind={head.status?.publish === "behind"} released={!!head.release} />
    </div>
  );
}
