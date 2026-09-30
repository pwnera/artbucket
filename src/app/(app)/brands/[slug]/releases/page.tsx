import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandHeader } from "@/components/brand-header";
import { ReleaseList } from "@/components/brand-releases";
import { AppHeader } from "@/components/page";
import { brandHead } from "@/lib/brand-head";
import { env } from "@/lib/env";
import type { Update } from "@/lib/history";
import { get } from "@/lib/sidebar";
import { brandPath } from "@/lib/site";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const head = await brandHead((await params).slug);
  return { title: head ? `${head.brand.name} releases` : "Releases" };
}

/** A brand's Releases tab: what readers got, release by release (GET /api/v1/brands/{slug}/updates). */
export default async function ReleasesPage({ params }: Props) {
  const { slug } = await params;
  const head = await brandHead(slug);
  if (!head) notFound();
  const { brand, rules, status, release } = head;
  const updates = await get(`brands/${encodeURIComponent(slug)}/updates`, (x: { data: Update[] }) => x.data, []);
  return (
    <>
      <AppHeader trail={[{ label: "Brands", href: "/brands" }, { label: brand.name, href: brandPath(slug) }, { label: "Releases" }]} />
      <BrandHeader brand={brand} origin={env.APP_URL} rules={rules} hub={status?.hub ?? null} release={release} at="releases" />
      <div className="mx-auto w-full max-w-5xl px-4 pt-6 pb-16 md:px-6">
        <ReleaseList slug={slug} updates={updates} pending={status?.publish === "behind"} />
      </div>
    </>
  );
}
