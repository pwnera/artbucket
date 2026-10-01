import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BrandHeader } from "@/components/brand-header";
import { BrandSettings } from "@/components/brand-settings";
import type { Source } from "@/components/builder/use-status";
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
  return { title: head ? `${head.brand.name} settings` : "Settings" };
}

/** A brand's Settings tab: name, address, default, repository, delete (GET /api/v1/brands/{slug}/source). */
export default async function BrandSettingsPage({ params }: Props) {
  const { slug } = await params;
  const b = encodeURIComponent(slug);
  const [head, me, source] = await Promise.all([brandHead(slug), whoami(), get(`brands/${b}/source`, (x: { data: Source }) => x.data, null)]);
  if (!head) notFound();
  if (!can(me, "brand.edit")) redirect(brandPath(slug));
  const { brand, rules, status, release } = head;
  return (
    <>
      <AppHeader trail={[{ label: "Brands", href: "/brands" }, { label: brand.name, href: brandPath(slug) }, { label: "Settings" }]} />
      <BrandHeader brand={brand} origin={env.APP_URL} rules={rules} status={status} release={release} at="settings" />
      <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-16 md:px-6">
        <BrandSettings key={brand.slug} brand={brand} source={source} />
      </div>
    </>
  );
}
