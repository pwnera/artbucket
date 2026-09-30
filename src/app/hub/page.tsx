import type { Metadata } from "next";
import { IconMoodEmpty } from "@tabler/icons-react";
import { CopyButton } from "@/components/copy-button";
import { Cards, TabNav } from "@/components/hub";
import { HubSearch } from "@/components/hub-client";
import { HUB_SORTS, hubBase, hubListings, hubViewer, type HubSort } from "@/lib/core/hub";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: { absolute: "BrandHub: brands to build with" },
  description: "Logos, colors, type and voice that open source projects, organizations and companies share, for people and agents.",
};

type Search = Record<string, string | string[] | undefined>;
type Props = { searchParams: Promise<Search> };

const FILTERS = { all: "All brands", verified: "Verified", community: "Community", private: "Private" } as const;
type Filter = keyof typeof FILTERS;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
const pick = <K extends string>(v: string, from: Record<K, string>, fallback: K) => (v in from ? (v as K) : fallback);

/** The hub's front page: what it is, a search, and every listing as a card, filtered and sorted as GitHub's explore is. */
export default async function HubHome({ searchParams }: Props) {
  const sp = await searchParams;
  const q = one(sp.q);
  const filter = pick(one(sp.filter), FILTERS, "all");
  const sort = pick<HubSort>(one(sp.sort), HUB_SORTS, "recent");
  const [base, viewer] = await Promise.all([hubBase(), hubViewer()]);
  const all = await hubListings({ q, sort, limit: 200, viewer });
  const pub = all.filter((c) => c.visibility === "public");
  const of: Record<Filter, typeof all> = {
    all,
    verified: pub.filter((c) => c.verified),
    community: pub.filter((c) => !c.verified),
    private: all.filter((c) => c.visibility === "private"),
  };
  const counts = Object.fromEntries(Object.entries(of).map(([k, v]) => [k, v.length])) as Record<Filter, number>;
  const cards = of[filter];
  // Private is the signed-in reader's own: a tab only for them.
  const tabs = (Object.keys(FILTERS) as Filter[]).filter((f) => f !== "private" || counts.private > 0);
  const href = (o: { filter?: Filter; sort?: HubSort }) => {
    const p = new URLSearchParams({
      ...(q && { q }),
      ...((o.filter ?? filter) !== "all" && { filter: o.filter ?? filter }),
      ...((o.sort ?? sort) !== "recent" && { sort: o.sort ?? sort }),
    });
    return `${base || "/"}${p.size ? `?${p}` : ""}`;
  };
  const first = pub[0];
  const sample = first ? `${env.HUB_URL}${first.path}/llms.txt` : `${env.HUB_URL}/llms.txt`;

  return (
    <>
      <section className="border-b" style={{ background: "radial-gradient(60rem 20rem at 10% 0%, color-mix(in oklab, var(--primary) 9%, transparent), transparent)" }}>
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 md:py-16 lg:grid-cols-[1fr_28rem] lg:items-center">
          <div className="grid gap-5">
            <p className="text-primary-ink text-xs font-semibold tracking-[.14em] uppercase">Open brands, ready for agents</p>
            <h1 className="font-display text-4xl font-semibold tracking-tight text-balance md:text-5xl">Brands to build with.</h1>
            <p className="text-muted-foreground max-w-xl text-lg text-pretty">
              Logos, colors, type and voice that projects, organizations and companies share. Browse them here, or hand one to an agent.
            </p>
            <HubSearch action={base || "/"} defaultValue={q} big className="max-w-xl" />
          </div>
          <figure className="bg-card overflow-hidden rounded-xl border shadow-[0_20px_50px_-20px_rgb(0_0_0/0.18)]">
            <figcaption className="text-muted-foreground flex items-center gap-2 border-b px-4 py-2.5 text-xs">
              <span aria-hidden className="flex gap-1.5">
                <i className="size-2.5 rounded-full bg-[#ff5f57]" />
                <i className="size-2.5 rounded-full bg-[#febc2e]" />
                <i className="size-2.5 rounded-full bg-[#28c840]" />
              </span>
              <span className="ms-2">Any agent, no key</span>
              <CopyButton text={`curl ${sample}`} label="Copy the command" what="the command" className="ms-auto" />
            </figcaption>
            <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed">
              <span className="text-muted-foreground">$ </span>curl {sample.replace(/^https?:\/\//, "")}
              {"\n"}
              <span className="text-primary-ink"># {first?.name ?? "BrandHub"}</span>
              {"\n"}
              <span className="text-muted-foreground">&gt; {first ? `${first.name}'s brand rules, from ${first.owner}.` : "Brand rules that owners share."}</span>
              {"\n\n"}
              <span className="text-muted-foreground">- As JSON: …/brand.json</span>
              {"\n"}
              <span className="text-muted-foreground">- As design tokens: …/tokens?format=css</span>
            </pre>
          </figure>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b">
          <TabNav label="Show" items={tabs.map((f) => ({ href: href({ filter: f }), label: FILTERS[f], count: counts[f], current: f === filter }))} />
          <nav aria-label="Sort" className="text-muted-foreground mb-2 flex items-center gap-1 text-sm">
            <span className="me-1">Sort</span>
            {(Object.keys(HUB_SORTS) as HubSort[]).map((s) => (
              <a
                key={s}
                href={href({ sort: s })}
                aria-current={s === sort ? "true" : undefined}
                className="hover:text-foreground aria-[current=true]:bg-muted aria-[current=true]:text-foreground rounded-md px-2 py-1"
              >
                {HUB_SORTS[s]}
              </a>
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
      </div>
    </>
  );
}
