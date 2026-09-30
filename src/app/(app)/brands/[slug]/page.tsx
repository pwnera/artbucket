import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandOverview, type BrandSignals } from "@/components/brand-overview";
import { brandHead, changesBetween } from "@/lib/brand-head";
import { env } from "@/lib/env";
import { releaseSummary } from "@/lib/history";
import { can } from "@/lib/permissions";
import { get, whoami } from "@/lib/sidebar";

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const head = await brandHead((await params).slug);
  return { title: head?.brand.name ?? "Brand" };
}

/** A brand's Overview: its header, card, colors, latest release and signals, from /api/v1 like any client's. */
export default async function BrandOverviewPage({ params }: Props) {
  const { slug } = await params;
  const [head, me] = await Promise.all([brandHead(slug), whoami()]);
  if (!head) notFound();
  const { brand, rules, status, releases, release } = head;
  const before = releases[1]?.number;
  const [signals, changes] = await Promise.all([
    can(me, "insights.read") ? get(`brands/${encodeURIComponent(slug)}/insights`, (x: { data: BrandSignals }) => x.data, null) : null,
    release && before ? changesBetween(slug, before, release.number).then((c) => c && releaseSummary(c)) : null,
  ]);
  // The first release is everything: counted, not listed.
  const first = release && !before && [`First release: ${plural(release.rules, "rule")}${release.pages ? `, ${plural(release.pages, "page")}` : ""}`];
  return (
    <BrandOverview
      brand={brand}
      origin={env.APP_URL}
      rules={rules}
      status={status}
      release={release}
      changes={first || changes}
      signals={signals}
    />
  );
}
