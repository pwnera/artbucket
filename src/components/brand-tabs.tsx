"use client";

import Link from "next/link";
import { IconCheck, IconChevronDown } from "@/components/icons";
import { useCan } from "@/components/can";
import { TabNav } from "@/components/hub";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { brandPath, guidelinesPath } from "@/lib/site";

export type BrandTab = "overview" | "guidelines" | "rules" | "theme" | "assets" | "releases" | "sharing" | "insights" | "settings";

type Tab = { id: BrandTab; label: string; href: string };

/**
 * A brand's tabs (PRD section 13, "In the app"), as a repository's are, each
 * at its own address under /brands/{slug}: six, one job each, in the order a
 * brand is made. Overview (what it is and what to do next), Rules (the brand
 * itself, edited there), Assets (the files they hold), Guidelines (the pages
 * drawn from both), Releases, and Sharing (who reads it outside the team).
 */
export function useBrandTabs(brand: { slug: string; name: string }): Tab[] {
  return [
    { id: "overview", label: "Overview", href: brandPath(brand.slug) },
    { id: "rules", label: "Rules", href: brandPath(brand.slug, "/rules") },
    { id: "assets", label: "Assets", href: brandPath(brand.slug, "/assets") },
    { id: "guidelines", label: "Guidelines", href: guidelinesPath(brand.slug) },
    { id: "releases", label: "Releases", href: brandPath(brand.slug, "/releases") },
    { id: "sharing", label: "Sharing", href: brandPath(brand.slug, "/sharing") },
  ];
}

/**
 * The brand's pages that aren't tabs, in the header's menu: Theme (the look of
 * its guidelines), Insights (who reads it; its summary is on the Overview) and
 * Settings. Each still at its own address; left out for whoever may not use it.
 */
export function useBrandMore(brand: { slug: string }): Tab[] {
  const can = useCan();
  return [
    ...(can("brand.edit") ? [{ id: "theme" as const, label: "Theme", href: brandPath(brand.slug, "/theme") }] : []),
    ...(can("insights.read") ? [{ id: "insights" as const, label: "Insights", href: brandPath(brand.slug, "/insights") }] : []),
    ...(can("brand.edit") ? [{ id: "settings" as const, label: "Settings", href: brandPath(brand.slug, "/settings") }] : []),
  ];
}

/**
 * The tabs as a row under the brand's header (components/brand-header.tsx), the one on show marked. A page from
 * the menu (Theme, Insights, Settings) joins the row while it is on show, so the row always says where you are.
 */
export function BrandTabs({ brand, at }: { brand: { slug: string; name: string }; at: BrandTab }) {
  const more = useBrandMore(brand).find((t) => t.id === at);
  const tabs = [...useBrandTabs(brand), ...(more ? [more] : [])];
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
  const more = useBrandMore(brand);
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
        {[...tabs, ...more].map((t, i) => {
          const mark = t.id === at && <IconCheck aria-hidden className="ms-auto" />;
          const run = here[t.id];
          const item = run ? (
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
          // The pages that aren't tabs, after a line.
          return i === tabs.length && more.length ? [<DropdownMenuSeparator key="more" />, item] : item;
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
