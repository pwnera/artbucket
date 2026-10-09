import type { Metadata } from "next";
import { IconMoodEmpty } from "@tabler/icons-react";
import { Input } from "@/components/ui/input";
import { Cards, Preview, TabNav } from "@/components/hub";
import { HubSearch } from "@/components/hub-client";
import { followedOrgs, HUB_SORTS, hubBase, hubCollectionsOf, hubListings, hubViewer, starred, type HubSort } from "@/lib/core/hub";
import Form from "next/form";
import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: { absolute: "BrandHub: brands to build with" },
  description: "Logos, colors, type and voice that open source projects, organizations and companies share, for people and agents.",
  // Every filter, sort and search is this one page to search engines.
  ...(env.HUB_URL && { alternates: { canonical: env.HUB_URL } }),
};

type Search = Record<string, string | string[] | undefined>;
type Props = { searchParams: Promise<Search> };

const FILTERS = { all: "All brands", following: "Following", starred: "Starred", verified: "Verified", community: "Community", private: "Private" } as const;
type Filter = keyof typeof FILTERS;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
const pick = <K extends string>(v: string, from: Record<K, string>, fallback: K) => (v in from ? (v as K) : fallback);

/** The hub's front page: what it is, a search, and every listing as a card, filtered and sorted as GitHub's explore is. */
export default async function HubHome({ searchParams }: Props) {
  const sp = await searchParams;
  const q = one(sp.q);
  const filter = pick(one(sp.filter), FILTERS, "all");
  // Trending this week first, as the prototype's hub opens: most pulled, ties newest first.
  const sort = pick<HubSort>(one(sp.sort), HUB_SORTS, "trending");
  const [base, viewer] = await Promise.all([hubBase(), hubViewer()]);
  const [all, stars, orgs] = await Promise.all([
    hubListings({ q, sort, limit: 200, viewer }),
    viewer ? starred(viewer.user.id) : new Set<string>(),
    viewer ? followedOrgs(viewer.user.id) : new Set<string>(),
  ]);
  const pub = all.filter((c) => c.visibility === "public");
  const of: Record<Filter, typeof all> = {
    all,
    following: all.filter((c) => orgs.has(c.org)),
    starred: all.filter((c) => stars.has(c.id)),
    verified: pub.filter((c) => c.verified),
    community: pub.filter((c) => !c.verified),
    private: all.filter((c) => c.visibility === "private"),
  };
  const counts = Object.fromEntries(Object.entries(of).map(([k, v]) => [k, v.length])) as Record<Filter, number>;
  const cards = of[filter];
  // Private, Following and Starred are the signed-in reader's own: tabs only for them.
  const own: Filter[] = ["private", "following", "starred"];
  const tabs = (Object.keys(FILTERS) as Filter[]).filter((f) => !own.includes(f) || counts[f] > 0);
  // The operator's curated collections, on the front page as it first opens.
  const collections = !q && filter === "all" ? await hubCollectionsOf(all) : [];
  const href = (o: { filter?: Filter; sort?: HubSort }) => {
    const p = new URLSearchParams({
      ...(q && { q }),
      ...((o.filter ?? filter) !== "all" && { filter: o.filter ?? filter }),
      ...((o.sort ?? sort) !== "trending" && { sort: o.sort ?? sort }),
    });
    return `${base || "/"}${p.size ? `?${p}` : ""}`;
  };
  // The hero's wall: the public brands with a mark, trending first.
  const wall = !q && filter === "all" ? pub.filter((c) => c.logo).slice(0, 12) : [];

  return (
    <>
      <section id="hub-hero" className="relative overflow-hidden border-b">
        <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] justify-items-start gap-5 px-4 pt-14 pb-10 md:pt-20">
          <p className="text-muted-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
            <span className="bg-primary size-1.5 rounded-full" />
            {pub.length} open {pub.length === 1 ? "brand" : "brands"}, ready for people and agents
          </p>
          <h1 className="font-display text-5xl font-semibold tracking-tight text-balance md:text-7xl">Brands to build with.</h1>
          <p className="text-muted-foreground max-w-xl text-lg text-pretty md:text-xl">
            Logos, colors, type and voice that projects, organizations and companies share. Browse them here, or hand one to an agent.
          </p>
          <HubSearch action={base || "/"} defaultValue={q} big className="w-full max-w-xl [&_input]:h-12 [&_input]:rounded-xl" />
        </div>
        {/* A wall of the brands themselves, one row drifting (globals.css .hub-marquee), still for reduced motion. */}
        {wall.length >= 6 && (
          <div className="hub-wall relative pb-10 [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
            <div className="hub-marquee flex w-max gap-3">
              {[...wall, ...wall].map((c, i) => (
                <a key={i} href={base + c.path} aria-hidden={i >= wall.length || undefined} tabIndex={i >= wall.length ? -1 : undefined} title={c.name} className="group block w-32 shrink-0 md:w-36">
                  <Preview card={c} className="aspect-[3/2] rounded-xl border shadow-sm transition-transform duration-300 group-hover:-translate-y-1" />
                </a>
              ))}
            </div>
          </div>
        )}
      </section>

      {collections.map((c) => (
        <section key={c.slug} aria-labelledby={`collection-${c.slug}`} className="mx-auto max-w-7xl px-4 pt-10">
          <h2 id={`collection-${c.slug}`} className="font-display text-2xl font-semibold tracking-tight">
            {c.title}
          </h2>
          {c.description && <p className="text-muted-foreground mt-1 max-w-2xl">{c.description}</p>}
          <Cards cards={c.cards.slice(0, 6)} base={base} className="mt-5" />
        </section>
      ))}

      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b">
          <TabNav label="Show" items={tabs.map((f) => ({ href: href({ filter: f }), label: FILTERS[f], count: counts[f], current: f === filter }))} />
          <nav aria-label="Sort" className="text-muted-foreground mb-2 flex items-center gap-1 text-sm">
            <span className="me-1">Sort</span>
            {(Object.keys(HUB_SORTS) as HubSort[]).map((s) => (
              // In the page, keeping its scroll: sorting doesn't throw you back above the hero.
              <Link
                key={s}
                href={href({ sort: s })}
                scroll={false}
                aria-current={s === sort ? "true" : undefined}
                className="hover:text-foreground aria-[current=true]:bg-muted aria-[current=true]:text-foreground rounded-md px-2 py-1 transition-colors"
              >
                {HUB_SORTS[s]}
              </Link>
            ))}
          </nav>
        </div>
        {q && (
          <p className="text-muted-foreground mb-4 text-sm">
            {cards.length} {cards.length === 1 ? "result" : "results"} for <b className="text-foreground">{q}</b>
          </p>
        )}
        {cards.length ? (
          <Cards cards={cards} base={base} />
        ) : (
          <div className="text-muted-foreground grid place-items-center gap-2 rounded-xl border border-dashed py-20 text-center">
            <IconMoodEmpty aria-hidden className="size-8" />
            <p className="text-foreground font-medium">{q ? `No brand matches "${q}"` : "No brand here yet"}</p>
            <p className="text-sm">
              {q ? "Try the brand's name or its owner's." : "Release a brand, then make it public on the Brands page."}
            </p>
          </div>
        )}

        {/* The public Brand Agent Score (app/hub/score), asked from the front page as the prototype's hub does. */}
        <Form action={`${base}/score`} className="mt-10 flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-5">
          <div className="min-w-60 flex-1">
            <p className="font-medium">How agent-ready is your brand?</p>
            <p className="text-muted-foreground text-sm">Enter a domain and get a free Brand Agent Score.</p>
          </div>
          <Input name="domain" required placeholder="yourbrand.com" aria-label="Your brand's domain" className="w-full sm:w-56" />
          <SubmitButton>Check</SubmitButton>
        </Form>
      </div>
    </>
  );
}
