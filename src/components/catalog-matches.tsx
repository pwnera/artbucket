"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { NavLink } from "@/components/app-sidebar";
import { StatusBadge, TypeIcon } from "@/components/catalog";
import { Button } from "@/components/ui/button";
import { TYPE_LABEL, type CatalogStatus, type CatalogType } from "@/lib/catalog";
import type { CatalogResults } from "@/lib/core/catalog";
import { cn } from "@/lib/utils";

/**
 * What else a search in Explore finds, beside the assets below it
 * (GET /api/v1/catalog): brands, collections, sites, and brands' rules and
 * guideline pages, and Storybooks' components. A row of types to pick one,
 * then a first look at each as cards above the assets, or (`only`) every
 * match of one type, a page at a time. Each opens in the catalog.
 */

const OTHERS: CatalogType[] = ["brand", "collection", "site", "rule", "page", "component"];
const SHOWN = 8;
const PAGE = 40;

type Found = { key: string; r: CatalogResults; items: CatalogResults["items"] };

const fetchCatalog = (q: string, types: CatalogType[], cursor: number, signal?: AbortSignal) => {
  const params = new URLSearchParams({ q, limit: String(PAGE), cursor: String(cursor) });
  for (const t of types) params.append("type", t);
  return fetch(`/api/v1/catalog?${params}`, { signal }).then((r) => (r.ok ? (r.json() as Promise<CatalogResults>) : null));
};

/** The matches of `types` for `q` (none asked: nothing), and the next page of them on `more`. */
function useFound(q: string, types: CatalogType[] | null) {
  const key = types && `${q}|${types.join()}`;
  const [found, setFound] = useState<Found | null>(null);
  useEffect(() => {
    if (!key || !types) return;
    const ac = new AbortController();
    const wait = setTimeout(() => {
      fetchCatalog(q, types, 0, ac.signal)
        .then((r) => r && setFound({ key, r, items: r.items }))
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(wait);
      ac.abort();
    };
    // `key` is q and types.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const now = found?.key === key ? found : null;
  const more = () =>
    now?.r.next != null &&
    fetchCatalog(q, types!, now.r.next)
      .then((r) => r && setFound((f) => (f?.key === key ? { key, r, items: [...f.items, ...r.items] } : f)))
      .catch(() => {});
  return now && { ...now, more };
}

export function CatalogMatches({ q, only, assets }: { q: string; only: CatalogType | null; assets: number }) {
  const all = useFound(q, OTHERS);
  const one = useFound(q, only && only !== "asset" ? [only] : null);
  if (!all) return null;
  const types = OTHERS.filter((t) => all.r.counts[t] || t === only);
  if (!types.length) return null;
  const total = OTHERS.reduce((n, t) => n + (all.r.counts[t] ?? 0), 0);
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
            <CardGrid>
              {(one?.items ?? []).map((i) => (
                <Card key={i.id} i={i} />
              ))}
            </CardGrid>
          )}
          {one?.r.next != null && (
            <Button variant="outline" size="sm" onClick={one.more}>
              Show more
            </Button>
          )}
        </Section>
      ) : (
        <Section title="Brands, collections and more" count={total}>
          <CardGrid>
            {OTHERS.flatMap((t) => all.items.filter((i) => i.type === t))
              .slice(0, SHOWN)
              .map((i) => (
                <Card key={i.id} i={i} />
              ))}
          </CardGrid>
          {total > SHOWN && <p className="text-muted-foreground text-xs">and {total - SHOWN} more: pick a type above to see them all</p>}
        </Section>
      )}
    </>
  );
}

const Card = ({ i }: { i: CatalogResults["items"][number] }) => (
  <ObjectCard
    type={i.type}
    href={`/catalog?o=${i.id}`}
    name={i.name}
    sub={`${TYPE_LABEL[i.type].one} · ${i.parent ? i.parent.name : i.project.name}`}
    status={i.status}
  />
);

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
        <button type="button" onClick={onClick} className={CARD}>
          {body}
        </button>
      )}
    </li>
  );
}
