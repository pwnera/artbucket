"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusBadge, TypeIcon } from "@/components/catalog";
import { TYPE_LABEL, type CatalogStatus, type CatalogType } from "@/lib/catalog";
import type { CatalogResults } from "@/lib/core/catalog";

/**
 * What else a search in Explore finds, beside the assets below it
 * (GET /api/v1/catalog): brands, collections, portals, and brands' rules and
 * guideline pages, as cards above the assets. Each opens in the catalog.
 */

const OTHERS: CatalogType[] = ["brand", "collection", "portal", "rule", "page"];
const SHOWN = 8;

export function CatalogMatches({ q }: { q: string }) {
  const [found, setFound] = useState<{ q: string; r: CatalogResults } | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    const params = new URLSearchParams({ q, limit: "40" });
    for (const t of OTHERS) params.append("type", t);
    const wait = setTimeout(() => {
      fetch(`/api/v1/catalog?${params}`, { signal: ac.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((r) => r && setFound({ q, r }))
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(wait);
      ac.abort();
    };
  }, [q]);
  const r = found?.q === q ? found.r : null;
  if (!r?.items.length) return null;
  const items = OTHERS.flatMap((t) => r.items.filter((i) => i.type === t));
  const total = OTHERS.reduce((n, t) => n + (r.counts[t] ?? 0), 0);
  return (
    <Section title="Brands, collections and more" count={total}>
      <CardGrid>
        {items.slice(0, SHOWN).map((i) => (
          <ObjectCard
            key={i.id}
            type={i.type}
            href={`/catalog?o=${i.id}`}
            name={i.name}
            sub={`${TYPE_LABEL[i.type].one} · ${i.parent ? i.parent.name : i.project.name}`}
            status={i.status}
          />
        ))}
      </CardGrid>
      {total > SHOWN && <p className="text-muted-foreground text-xs">and {total - SHOWN} more: narrow the search to see them</p>}
    </Section>
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
        <button type="button" onClick={onClick} className={CARD}>
          {body}
        </button>
      )}
    </li>
  );
}
