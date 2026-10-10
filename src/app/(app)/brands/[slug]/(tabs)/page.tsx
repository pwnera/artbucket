import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BrandOverview, type BrandSignals } from "@/components/brand-overview";
import type { Source } from "@/components/builder/use-status";
import { BrandImporting, GitReturn } from "@/components/git-return";
import { TabSkeleton } from "@/components/skeletons";
import { brandHead, changesBetween } from "@/lib/brand-head";
import { openCounts } from "@/lib/comments";
import { hubBrand, hubViewer } from "@/lib/core/hub";
import { releaseSummary } from "@/lib/history";
import { can } from "@/lib/permissions";
import { get, whoami } from "@/lib/sidebar";
import { brandPath, builderPath } from "@/lib/site";

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const head = await brandHead((await params).slug);
  return { title: head?.brand.name ?? "Brand" };
}

/** A brand's Overview: its header, card, latest release and signals, from /api/v1 like any client's; the card as BrandHub reads it. */
export default function BrandOverviewPage({ params }: Props) {
  return (
    <Suspense fallback={<TabSkeleton />}>
      <Tab params={params} />
    </Suspense>
  );
}

async function Tab({ params }: Props) {
  const { slug } = await params;
  const [head, me] = await Promise.all([brandHead(slug), whoami()]);
  if (!head) notFound();
  const { brand, rules, status, releases, release } = head;
  const releasing = can(me, "brand.publish") ? brandPath(slug, "/releases/new") : undefined;
  // Brought in from a repository and not in yet: nothing to show but that it is coming.
  // ponytail: an empty brand sent out as a pull request waits here too until it merges; tell them apart if that bites.
  const source = !rules.length && !release ? await get(`brands/${encodeURIComponent(slug)}/source`, (x: { data: Source }) => x.data.source, null) : null;
  if (source && !source.syncedAt) {
    return (
      <>
        <BrandImporting name={brand.name} remote={source.remote} />
        <GitReturn brand={slug} release={releasing} waiting />
      </>
    );
  }
  const before = releases[1]?.number;
  type Thread = Parameters<typeof openCounts>[0][number];
  const [signals, changes, live, comments] = await Promise.all([
    can(me, "insights.read") ? get(`brands/${encodeURIComponent(slug)}/insights`, (x: { data: BrandSignals }) => x.data, null) : null,
    release && before ? changesBetween(slug, before, release.number).then((c) => c && releaseSummary(c)) : null,
    // The card readers see: the release as BrandHub reads it, for this person, private or not (lib/core/hub.ts).
    release ? hubViewer().then((viewer) => viewer && hubBrand(me.project.organization.slug, slug, { viewer, project: me.project.id })) : null,
    // Counted as /releases/new counts them.
    get(`brands/${encodeURIComponent(slug)}/comments`, (x: { data: Thread[] }) => openCounts(x.data).open, null),
  ]);
  // The first release is everything: counted, not listed.
  const first = release && !before && [`First release: ${plural(release.rules, "rule")}${release.pages ? `, ${plural(release.pages, "page")}` : ""}`];
  return (
    <>
      <BrandOverview
        brand={brand}
        rules={rules}
        status={status}
        release={release}
        changes={first || changes}
        signals={signals}
        // Never released (or not readable so): the draft, labeled so.
        card={
          live
            ? { brand: { name: live.name, rules: live.rules, signed: live.signed, terms: live.terms }, live: live.version }
            : { brand: { name: brand.name, rules, signed: null, terms: status?.hub?.terms ?? null }, live: null }
        }
        comments={comments}
        links={{
          release: can(me, "brand.publish") ? brandPath(slug, "/releases/new") : undefined,
          review: can(me, "brand.edit") ? builderPath(slug) : undefined,
        }}
      />
      {/* The Git integration lands here after connecting or bringing the brand in. */}
      <GitReturn brand={slug} release={releasing} />
    </>
  );
}
