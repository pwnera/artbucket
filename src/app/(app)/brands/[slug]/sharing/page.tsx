import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandHeader } from "@/components/brand-header";
import { BrandSharing } from "@/components/brand-sharing";
import type { BrandHub } from "@/components/brands";
import type { Portal } from "@/components/portals";
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
  return { title: head ? `${head.brand.name} sharing` : "Sharing" };
}

/**
 * A brand's Sharing tab, for everyone who reads it: BrandHub (GET
 * /api/v1/brands/{slug}/hub), the portals showing it (GET /api/v1/portals,
 * for whoever manages portals) and the addresses agents and code read.
 */
export default async function BrandSharingPage({ params }: Props) {
  const { slug } = await params;
  const [head, me, hub] = await Promise.all([brandHead(slug), whoami(), get(`brands/${encodeURIComponent(slug)}/hub`, (x: { data: BrandHub }) => x.data, null)]);
  if (!head) notFound();
  const { brand, rules, status, release } = head;
  const portals = can(me, "portal.manage") ? await get("portals", (x: { data: Portal[] }) => x.data.filter((p) => p.brands.some((b) => b.slug === slug)), []) : null;
  return (
    <>
      <AppHeader trail={[{ label: "Brands", href: "/brands" }, { label: brand.name, href: brandPath(slug) }, { label: "Sharing" }]} />
      <BrandHeader brand={brand} origin={env.APP_URL} rules={rules} status={status} release={release} at="sharing" />
      <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-16 md:px-6">
        <BrandSharing key={brand.slug} brand={brand} origin={env.APP_URL} hub={hub} portals={portals} portalDomain={env.PORTAL_DOMAIN} release={release} />
      </div>
    </>
  );
}
