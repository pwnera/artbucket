"use client";

import Link from "next/link";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { useCan } from "@/components/can";
import { TabNav } from "@/components/hub";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { brandPath, guidelinesPath } from "@/lib/site";

export type BrandTab = "overview" | "guidelines" | "rules" | "assets" | "releases" | "sharing" | "lineage" | "access" | "activity" | "insights" | "settings";

/**
 * A brand's tabs (PRD section 13, "In the app"), as a repository's are. The
 * brand's page is read-only and its tabs stay in it, each at its own address
 * under /brands/{slug}; Edit, in the header, is the way into the builder.
 * Left out for whoever may not use the page behind a tab.
 */
export function useBrandTabs(brand: { slug: string; name: string }) {
  const can = useCan();
  const tabs: { id: BrandTab; label: string; href: string }[] = [
    { id: "overview", label: "Overview", href: brandPath(brand.slug) },
    { id: "guidelines", label: "Guidelines", href: guidelinesPath(brand.slug) },
    { id: "rules", label: "Tokens and rules", href: brandPath(brand.slug, "/rules") },
    { id: "assets", label: "Assets", href: brandPath(brand.slug, "/assets") },
    { id: "releases", label: "Releases", href: brandPath(brand.slug, "/releases") },
    { id: "sharing", label: "Sharing", href: brandPath(brand.slug, "/sharing") },
    // The catalog's tabs, the same on every object (components/catalog.tsx).
    { id: "lineage", label: "Lineage", href: brandPath(brand.slug, "/lineage") },
    { id: "access", label: "Access", href: brandPath(brand.slug, "/access") },
    { id: "activity", label: "Activity", href: brandPath(brand.slug, "/activity") },
    ...(can("insights.read") ? [{ id: "insights" as const, label: "Insights", href: brandPath(brand.slug, "/insights") }] : []),
    ...(can("brand.edit") ? [{ id: "settings" as const, label: "Settings", href: brandPath(brand.slug, "/settings") }] : []),
  ];
  return tabs;
}

/** The tabs as a row under the brand's header (components/brand-header.tsx), the one on show marked. */
export function BrandTabs({ brand, at }: { brand: { slug: string; name: string }; at: BrandTab }) {
  const tabs = useBrandTabs(brand);
  return (
    <div className="mt-4 border-b">
      <TabNav label={`${brand.name}`} items={tabs.map((t) => ({ href: t.href, label: t.label, current: t.id === at }))} className="mx-auto w-full max-w-5xl px-2 md:px-4" />
    </div>
  );
}

/**
 * The tabs folded into one menu on the brand's name, for the guidelines'
 * focus mode: the builder's bar and the reader's, with the app's sidebar
 * folded to its rail. `here` does a tab in place rather than by address (the
 * builder opens its Rules or History without reloading the page on show).
 */
export function BrandTabMenu({ brand, at, here = {} }: { brand: { slug: string; name: string }; at: BrandTab; here?: Partial<Record<BrandTab, () => void>> }) {
  const tabs = useBrandTabs(brand);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${brand.name}, its tabs`}
          className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 flex h-7 min-w-0 shrink-0 items-center gap-1 rounded-md px-1.5 text-sm outline-none focus-visible:ring-2"
        >
          <span className="max-w-40 truncate">{brand.name}</span>
          <IconChevronDown aria-hidden className="size-3.5 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="app-tokens w-52">
        {tabs.map((t) => {
          const mark = t.id === at && <IconCheck aria-hidden className="ms-auto" />;
          const run = here[t.id];
          return run ? (
            <DropdownMenuItem key={t.id} onSelect={run}>
              {t.label} {mark}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem key={t.id} asChild>
              <Link href={t.href} aria-current={t.id === at ? "page" : undefined}>
                {t.label} {mark}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
