import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { BrandSettings } from "@/components/brand-settings";
import type { Source } from "@/components/builder/use-status";
import { TabSkeleton } from "@/components/skeletons";
import { brandHead } from "@/lib/brand-head";
import { can } from "@/lib/permissions";
import { get, whoami } from "@/lib/sidebar";
import { brandPath } from "@/lib/site";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const head = await brandHead((await params).slug);
  return { title: head ? `${head.brand.name} settings` : "Settings" };
}

/** A brand's Settings tab: name, address, default, repository, delete (GET /api/v1/brands/{slug}/source). */
export default function BrandSettingsPage({ params }: Props) {
  return (
    <Suspense fallback={<TabSkeleton body="form" width="3xl" />}>
      <Tab params={params} />
    </Suspense>
  );
}

async function Tab({ params }: Props) {
  const { slug } = await params;
  const b = encodeURIComponent(slug);
  const [head, me, source] = await Promise.all([brandHead(slug), whoami(), get(`brands/${b}/source`, (x: { data: Source }) => x.data, null)]);
  if (!head) notFound();
  if (!can(me, "brand.edit")) redirect(brandPath(slug));
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-16 md:px-6">
      <BrandSettings key={head.brand.slug} brand={head.brand} source={source} />
    </div>
  );
}
