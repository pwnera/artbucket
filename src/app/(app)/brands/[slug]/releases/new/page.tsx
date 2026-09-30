import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BrandHeader } from "@/components/brand-header";
import { NewRelease } from "@/components/brand-releases";
import { AppHeader } from "@/components/page";
import { brandHead } from "@/lib/brand-head";
import { openCounts } from "@/lib/comments";
import { env } from "@/lib/env";
import { can } from "@/lib/permissions";
import { get, whoami } from "@/lib/sidebar";
import { brandPath } from "@/lib/site";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const head = await brandHead((await params).slug);
  return { title: head ? `New release · ${head.brand.name}` : "New release" };
}

/**
 * Publish a release as a page (the prototype's /brands/{slug}/releases/new):
 * the builder's release form, what changed since the last release, the
 * score before and after. Whoever may not publish sees the releases.
 */
export default async function NewReleasePage({ params }: Props) {
  const { slug } = await params;
  const [head, me] = await Promise.all([brandHead(slug), whoami()]);
  if (!head) notFound();
  if (!can(me, "brand.edit")) redirect(brandPath(slug, "/releases"));
  const { brand, rules, status, release } = head;
  type Row = Parameters<typeof openCounts>[0][number];
  const comments = await get(`brands/${encodeURIComponent(slug)}/comments`, (x: { data: (Row & { replies?: Row[] })[] }) => openCounts(x.data).open, 0);
  return (
    <>
      <AppHeader trail={[{ label: "Brands", href: "/brands" }, { label: brand.name, href: brandPath(slug) }, { label: "New release" }]} />
      <BrandHeader brand={brand} origin={env.APP_URL} rules={rules} hub={status?.hub ?? null} release={release} at="releases" />
      <div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-16 md:px-6">
        <NewRelease slug={slug} name={brand.name} status={status} comments={comments} />
      </div>
    </>
  );
}
