"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { brandHref } from "@/components/brand-switcher";
import { Fold } from "@/components/fields";
import { contextLabel, ruleLabel } from "@/lib/rules";

/** GET /api/v1/assets/{id}/insights, as lib/schemas.ts AssetInsights has it. */
type UsedInData = {
  days: number;
  rules: { brand: string; key: string; label: string | null; context: string | null }[];
  pages: { brand: { slug: string; name: string; default: boolean }; slug: string; title: string }[];
  portals: { name: string; url: string }[];
  fetches: { total: number; surfaces: Partial<Record<string, number>> };
  referrers: { host: string; fetches: number; last: string }[];
};

const SURFACE: Record<string, string> = { app: "App", api: "API", mcp: "MCP", portal: "Portal", share: "Share link", hub: "BrandHub", link: "Signed link", public: "Public" };

const n = (count: number, what: string) => `${count.toLocaleString()} ${what}${count === 1 ? "" : "s"}`;

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <p className="text-muted-foreground text-xs font-medium">{title}</p>
      <ul className="grid gap-0.5 text-sm">{children}</ul>
    </div>
  );
}

/**
 * Where an asset is used (PRD INS-5), folded in the asset's panel: the brand
 * rules and pages that show it, the public portals it is on, and how it was
 * fetched lately, by surface and by the sites that load it. For whoever may
 * read Insights; `leave` saves what is typed before a link goes elsewhere.
 */
export function UsedIn({ assetId, leave }: { assetId: string; leave: (next: () => void) => void }) {
  // Kept with the asset it is about, so a step to the next asset doesn't show the last one's.
  const [held, setHeld] = useState<{ id: string; data: UsedInData } | null>(null);
  const router = useRouter();
  useEffect(() => {
    let live = true;
    fetch(`/api/v1/assets/${assetId}/insights`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { data: UsedInData } | null) => live && b && setHeld({ id: assetId, data: b.data }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [assetId]);
  const got = held?.id === assetId ? held.data : null;
  if (!got) return null;
  const go = (href: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    leave(() => router.push(href));
  };
  const summary = [
    got.rules.length && n(got.rules.length, "rule"),
    got.pages.length && n(got.pages.length, "page"),
    got.portals.length && n(got.portals.length, "portal"),
    `${got.fetches.total.toLocaleString()} ${got.fetches.total === 1 ? "fetch" : "fetches"}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const surfaces = Object.entries(got.fetches.surfaces).sort(([, a], [, b]) => b! - a!);
  return (
    <Fold title="Used in" summary={summary} remember="used-in">
      {got.rules.length > 0 && (
        <Part title="Brand rules">
          {got.rules.map((r) => {
            const href = `/brand?brand=${r.brand}#rule-${r.key}`;
            return (
              <li key={`${r.brand}/${r.key}/${r.context}`}>
                <Link href={href} onClick={go(href)} className="hover:underline">
                  {r.label ?? ruleLabel(r.key)}
                </Link>
                {r.context && <span className="text-muted-foreground"> ({contextLabel(r.context)})</span>}
              </li>
            );
          })}
        </Part>
      )}
      {got.pages.length > 0 && (
        <Part title="Brand pages">
          {got.pages.map((p) => {
            const base = brandHref(p.brand);
            const href = `${base}${base.includes("?") ? "&" : "?"}page=${encodeURIComponent(p.slug)}`;
            return (
              <li key={`${p.brand.slug}/${p.slug}`}>
                <Link href={href} onClick={go(href)} className="hover:underline">
                  {p.title}
                </Link>
                <span className="text-muted-foreground">, {p.brand.name}</span>
              </li>
            );
          })}
        </Part>
      )}
      {got.portals.length > 0 && (
        <Part title="Public portals">
          {got.portals.map((p) => (
            <li key={p.url}>
              <a href={p.url} target="_blank" rel="noreferrer" className="hover:underline">
                {p.name}
              </a>
            </li>
          ))}
        </Part>
      )}
      <Part title={`Fetches, last ${got.days} days`}>
        {surfaces.length === 0 ? (
          <li className="text-muted-foreground">None outside the library&apos;s own pages.</li>
        ) : (
          surfaces.map(([s, count]) => (
            <li key={s} className="flex justify-between gap-2">
              {SURFACE[s] ?? s} <span className="text-muted-foreground tabular-nums">{count!.toLocaleString()}</span>
            </li>
          ))
        )}
      </Part>
      {got.referrers.length > 0 && (
        <Part title="Loaded from">
          {got.referrers.map((r) => (
            <li key={r.host} className="flex justify-between gap-2">
              <span className="min-w-0 truncate">{r.host}</span>
              <span className="text-muted-foreground tabular-nums">{r.fetches.toLocaleString()}</span>
            </li>
          ))}
        </Part>
      )}
    </Fold>
  );
}
