import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BrandHeader } from "@/components/brand-header";
import { BrandPortals } from "@/components/brand-portals";
import { AppHeader } from "@/components/page";
import { brandHead } from "@/lib/brand-head";
import { env } from "@/lib/env";
import { brandPath } from "@/lib/site";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const head = await brandHead((await params).slug);
  return { title: head ? `${head.brand.name} portals` : "Portals" };
}

/** A brand's Portals tab: the portals showing it (GET /api/v1/brands/{slug}/status), for whoever manages portals. */
export default async function BrandPortalsPage({ params }: Props) {
  const { slug } = await params;
  const head = await brandHead(slug);
  if (!head) notFound();
  const { brand, rules, status, release } = head;
  // Only whoever manages portals is told which show the brand.
  if (!status?.portals) redirect(brandPath(slug));
  return (
    <>
      <AppHeader trail={[{ label: "Brands", href: "/brands" }, { label: brand.name, href: brandPath(slug) }, { label: "Portals" }]} />
      <BrandHeader brand={brand} origin={env.APP_URL} rules={rules} status={status} release={release} at="portals" />
      <div className="mx-auto w-full max-w-5xl px-4 pt-6 pb-16 md:px-6">
        <BrandPortals slug={slug} portals={status.portals} hub={status.hub} />
      </div>
    </>
  );
}
