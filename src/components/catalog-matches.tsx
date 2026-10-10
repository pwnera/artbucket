"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusBadge, TypeIcon } from "@/components/catalog";
import { TYPE_LABEL, type CatalogType } from "@/lib/catalog";
import type { CatalogResults } from "@/lib/core/catalog";

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
            <div key={t} className="min-w-56 flex-1 space-y-1">
              <h2 className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                <TypeIcon type={t} className="size-3.5" />
                {TYPE_LABEL[t].many}
                <span className="tabular-nums">{r.counts[t]}</span>
              </h2>
              <ul className="bg-card divide-y rounded-lg border">
                {list.slice(0, 4).map((i) => (
                  <li key={i.id}>
                    <Link href={`/catalog?o=${i.id}`} className="hover:bg-accent flex items-center gap-2 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{i.name}</span>
                        <span className="text-muted-foreground block truncate text-xs">{i.parent ? `In ${i.parent.name}` : i.project.name}</span>
                      </span>
                      {i.status !== "current" && <StatusBadge status={i.status} />}
                    </Link>
                  </li>
                ))}
              </ul>
              {list.length > 4 && <p className="text-muted-foreground px-1 text-xs">and {(r.counts[t] ?? list.length) - 4} more</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
