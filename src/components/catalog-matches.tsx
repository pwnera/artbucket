"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { NavLink } from "@/components/app-sidebar";
import { useMe } from "@/components/can";
import { StatusBadge, TypeIcon } from "@/components/catalog";
import { Button } from "@/components/ui/button";
import { openPath, TYPE_LABEL, type CatalogStatus, type CatalogType } from "@/lib/catalog";
import type { CatalogResults } from "@/lib/core/catalog";
import type { Narrow } from "@/lib/view";
import { cn } from "@/lib/utils";

/**
 * What a search in Explore finds of every type (GET /api/v1/catalog): a row
 * of types to pick one, then the top results as one ranked list, assets
 * among brands, collections, sites, rules, guideline pages and components,
 * each drawn as the same card, above the assets to work on; or (`only`)
 * every match of one type, a page at a time. Each opens where the app shows
 * it; an asset of this project in the viewer, in place.
 */

const OTHERS: CatalogType[] = ["brand", "collection", "site", "rule", "page", "component"];
const EVERY: CatalogType[] = [...OTHERS, "asset"];
const SHOWN = 8;
const PAGE = 40;

type Found = { key: string; r: CatalogResults; items: CatalogResults["items"] };

/** `record`: the search of every type is Explore's one search for Insights; a type's tab is a look at it. */
const fetchCatalog = (q: string, types: CatalogType[], narrow: Narrow, cursor: number, signal?: AbortSignal) => {
  const params = new URLSearchParams({ q, limit: String(PAGE), cursor: String(cursor) });
  if (types.length !== EVERY.length) params.set("record", "false");
  for (const t of types) params.append("type", t);
  for (const t of narrow.tags) params.append("tag", t);
  if (narrow.statuses.length) params.set("status", narrow.statuses.join(","));
  return fetch(`/api/v1/catalog?${params}`, { signal }).then((r) => (r.ok ? (r.json() as Promise<CatalogResults>) : null));
};

/** The matches of `types` for `q` (none asked: nothing), and the next page of them on `more`. */
function useFound(q: string, types: CatalogType[] | null, narrow: Narrow) {
  const key = types && `${q}|${types.join()}|${narrow.tags.join()}|${narrow.statuses.join()}`;
  const [found, setFound] = useState<Found | null>(null);
  useEffect(() => {
    if (!key || !types) return;
    const ac = new AbortController();
    const wait = setTimeout(() => {
      fetchCatalog(q, types, narrow, 0, ac.signal)
        .then((r) => r && setFound({ key, r, items: r.items }))
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(wait);
      ac.abort();
    };
    // `key` is q, types and narrow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const now = found?.key === key ? found : null;
  const more = () =>
    now?.r.next != null &&
    fetchCatalog(q, types!, narrow, now.r.next)
      .then((r) => r && setFound((f) => (f?.key === key ? { key, r, items: [...f.items, ...r.items] } : f)))
      .catch(() => {});
  return now && { ...now, more };
}

/** `narrow`: Explore's tags and states, which narrow every type as they narrow the assets below. */
export function CatalogMatches({
  q,
  only,
  assets,
  narrow,
  onOpenAsset,
}: {
  q: string;
  only: CatalogType | null;
  assets: number;
  narrow: Narrow;
  onOpenAsset: (id: string) => void;
}) {
  const here = useMe()?.project.id;
  const all = useFound(q, EVERY, narrow);
  const one = useFound(q, only && only !== "asset" ? [only] : null, narrow);
  const card = (i: Item) => <ResultCard key={i.id} i={i} {...(i.type === "asset" && i.project.id === here ? { onClick: () => onOpenAsset(i.id) } : { href: openPath(i) })} />;
  if (!all) return null;
  const types = OTHERS.filter((t) => all.r.counts[t] || t === only);
  if (!types.length) return null;
  const href = (t: CatalogType | null) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (t) p.set("in", t);
    return p.size ? `/?${p}` : "/";
  };
  const tab = (t: CatalogType | null, label: string, n?: number) => (
    <NavLink
      key={t ?? "all"}
      href={href(t)}
      aria-current={only === t ? "page" : undefined}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors",
        only === t ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent",
      )}
    >
      {label}
      {n != null && <span className={cn("text-xs tabular-nums", only !== t && "text-muted-foreground")}>{n.toLocaleString()}</span>}
    </NavLink>
  );
  return (
    <>
      <nav aria-label="What to explore" className="flex flex-wrap gap-2">
        {tab(null, "Everything")}
        {tab("asset", TYPE_LABEL.asset.many, assets)}
        {types.map((t) => tab(t, TYPE_LABEL[t].many, all.r.counts[t] ?? 0))}
      </nav>
      {only === "asset" ? null : only ? (
        <Section title={TYPE_LABEL[only].many} count={one?.r.total}>
          {one && !one.items.length ? (
            <p className="text-muted-foreground text-sm">No {TYPE_LABEL[only].many.toLowerCase()} match.</p>
          ) : (
            <CardGrid>{(one?.items ?? []).map(card)}</CardGrid>
          )}
          {one?.r.next != null && (
            <Button variant="outline" size="sm" onClick={one.more}>
              Show more
            </Button>
          )}
        </Section>
      ) : (
        // Ranked together, whatever their type: a strong component comes before a weak asset.
        <Section title="Top results">
          <CardGrid>{all.items.slice(0, SHOWN).map(card)}</CardGrid>
          {all.r.total > SHOWN && <p className="text-muted-foreground text-xs">Pick a type above to see every match of it</p>}
          {/* What the search left out, so a missing logo isn't a mystery: "logo.png @3 matches too, but it was replaced by @4." */}
          {all.r.hidden.example && (
            <p className="text-muted-foreground text-xs">
              {all.r.hidden.example}
              {all.r.hidden.count > 1 && ` ${all.r.hidden.count - 1} more replaced, archived or expired ${all.r.hidden.count === 2 ? "match" : "matches"} left out too.`}
            </p>
          )}
        </Section>
      )}
    </>
  );
}

type Item = CatalogResults["items"][number];

/**
 * A search result of any type, drawn one way: what it looks like on top (an
 * asset's rendition, a component's story, else its type's icon), then its
 * name, what it is and where, and its status when not current. It opens
 * where the app shows it (lib/catalog.ts openPath), as from every other list.
 */
export function ResultCard({ i, href, onClick }: { i: Item; href?: string; onClick?: () => void }) {
  const [broken, setBroken] = useState(false);
  const look =
    i.type === "asset" && !broken ? (
      // eslint-disable-next-line @next/next/no-img-element -- a rendition, already sized
      <img src={`/a/${i.id}/w_320,f_webp`} alt="" loading="lazy" onError={() => setBroken(true)} className="size-full object-contain" />
    ) : i.type === "component" && i.preview ? (
      // The story at a desk's width, shrunk to the card: never interactive here, so the card stays one link.
      <iframe src={i.preview} title={i.name} loading="lazy" tabIndex={-1} sandbox="allow-scripts allow-same-origin" className="pointer-events-none absolute top-0 left-0 h-[250%] w-[250%] origin-top-left scale-[0.4] border-0" />
    ) : (
      <span className="text-muted-foreground [&_svg]:size-6">
        <TypeIcon type={i.type} />
      </span>
    );
  const body = (
    <>
      <span className="bg-muted relative flex aspect-[4/3] items-center justify-center overflow-hidden border-b">{look}</span>
      <span className="flex items-center gap-2 px-3 py-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{i.name}</span>
          <span className="text-muted-foreground block truncate text-xs">
            {TYPE_LABEL[i.type].one} · {i.parent ? i.parent.name : i.project.name}
          </span>
        </span>
        {i.status !== "current" && <StatusBadge status={i.status} />}
      </span>
    </>
  );
  const cls = "bg-card hover:bg-accent focus-visible:ring-ring/50 flex w-full flex-col overflow-hidden rounded-xl border text-start transition-colors outline-none focus-visible:ring-2";
  return (
    <li>
      {href ? (
        <Link href={href} className={cls}>
          {body}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={cls}>
          {body}
        </button>
      )}
    </li>
  );
}

/** A titled part of Explore or the catalog: "Brands and collections", "Assets for you". */
export function Section({ title, count, aside, children }: { title: string; count?: number; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium">{title}</h2>
        {count != null && <span className="text-muted-foreground text-xs tabular-nums">{count.toLocaleString()}</span>}
        {aside && <span className="ms-auto">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

export const CardGrid = ({ children }: { children: React.ReactNode }) => <ul className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3">{children}</ul>;

const CARD =
  "bg-card hover:bg-accent focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-start transition-colors outline-none focus-visible:ring-2";

/** A brand, collection, portal or rule as a card: its icon, its name, what it is and where. */
export function ObjectCard({
  type,
  icon,
  href,
  onClick,
  name,
  sub,
  status,
}: {
  type?: CatalogType;
  icon?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  name: string;
  sub?: string;
  status?: CatalogStatus;
}) {
  const body = (
    <>
      <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-[18px]">
        {icon ?? (type && <TypeIcon type={type} />)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name}</span>
        {sub && <span className="text-muted-foreground block truncate text-xs">{sub}</span>}
      </span>
      {status && status !== "current" && <StatusBadge status={status} />}
    </>
  );
  return (
    <li>
      {href ? (
        <Link href={href} className={CARD}>
          {body}
        </Link>
      ) : (
        // eslint-disable-next-line no-restricted-syntax -- the card twin of the Link above, the whole card the hit target
        <button type="button" onClick={onClick} className={CARD}>
          {body}
        </button>
      )}
    </li>
  );
}
