"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusBadge, TypeIcon } from "@/components/catalog";
import { TYPE_LABEL, type CatalogType } from "@/lib/catalog";
import type { CatalogResults, CatalogItem } from "@/lib/core/catalog";

/**
 * What else a search in Explore finds, beside the assets below it
 * (GET /api/v1/catalog): brands, collections, portals, and brands' rules and
 * guideline pages, grouped by type. Each opens in the catalog.
 */

const OTHERS: CatalogType[] = ["brand", "rule", "page", "collection", "portal"];

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
  return (
    <section aria-label="Also in the catalog" className="space-y-2">
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        {OTHERS.map((t) => {
          const list = r.items.filter((i) => i.type === t);
          if (!list.length) return null;
          return (
            <TypeBlock
              key={t}
              type={t}
              count={r.counts[t]}
              more={list.length > 4 ? (r.counts[t] ?? list.length) - 4 : 0}
              rows={list.slice(0, 4).map((i) => ({ key: i.id, href: `/catalog?o=${i.id}`, name: i.name, sub: i.parent ? `In ${i.parent.name}` : i.project.name, status: i.status }))}
            />
          );
        })}
      </div>
    </section>
  );
}

/** A type's block: its name and count over a few rows, each a link. Explore's recents use it too. */
export function TypeBlock({
  type,
  count,
  more = 0,
  rows,
}: {
  type: CatalogType;
  count?: number;
  more?: number;
  rows: { key: string; href: string; name: string; sub?: string; status?: CatalogItem["status"] }[];
}) {
  return (
    <div className="min-w-56 flex-1 space-y-1">
      <h2 className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
        <TypeIcon type={type} className="size-3.5" />
        {TYPE_LABEL[type].many}
        {count != null && <span className="tabular-nums">{count}</span>}
      </h2>
      <ul className="bg-card divide-y rounded-lg border">
        {rows.map((i) => (
          <li key={i.key}>
            <Link href={i.href} className="hover:bg-accent flex items-center gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{i.name}</span>
                {i.sub && <span className="text-muted-foreground block truncate text-xs">{i.sub}</span>}
              </span>
              {i.status && i.status !== "current" && <StatusBadge status={i.status} />}
            </Link>
          </li>
        ))}
      </ul>
      {more > 0 && <p className="text-muted-foreground px-1 text-xs">and {more} more</p>}
    </div>
  );
}
