"use client";

import { useCan } from "@/components/can";
import { TabNav } from "@/components/hub";
import { brandPath, guidelinesPath } from "@/lib/site";

export type BrandTab = "overview" | "guidelines" | "rules" | "assets" | "releases" | "portals" | "insights" | "settings";

/**
 * A brand's tabs (PRD section 13, "In the app"), as a repository's are. Each
 * is a link: Overview and Guidelines are the brand's own pages, the rest
 * open the page each concern already has, on this brand where it can be
 * (the builder's rules or history, the portals showing it, its row on the
 * Brands page). The library and Insights are the workspace's: assets are not
 * a brand's, and its own signals are on Overview. Left out for whoever may
 * not use the page behind a tab.
 */
export function useBrandTabs(brand: { slug: string; name: string }) {
  const can = useCan();
  const tabs: { id: BrandTab; label: string; href: string }[] = [
    { id: "overview", label: "Overview", href: brandPath(brand.slug) },
    { id: "guidelines", label: "Guidelines", href: guidelinesPath(brand.slug) },
    { id: "rules", label: "Tokens and rules", href: guidelinesPath(brand.slug, { panel: "rules" }) },
    { id: "assets", label: "Assets", href: "/" },
    { id: "releases", label: "Releases", href: guidelinesPath(brand.slug, { panel: "history" }) },
    ...(can("portal.manage") ? [{ id: "portals" as const, label: "Portals", href: `/portals?${new URLSearchParams({ brand: brand.slug })}` }] : []),
    ...(can("insights.read") ? [{ id: "insights" as const, label: "Insights", href: "/insights" }] : []),
    ...(can("brand.edit") ? [{ id: "settings" as const, label: "Settings", href: `/brands?${new URLSearchParams({ q: brand.name })}` }] : []),
  ];
  return tabs;
}

/** The tabs as a row under the app's bar, the one on show marked; `children` sit at its end (Use this brand). */
export function BrandTabs({ brand, at, children }: { brand: { slug: string; name: string }; at: BrandTab; children?: React.ReactNode }) {
  const tabs = useBrandTabs(brand);
  return (
    <div className="flex items-center gap-2 border-b px-2 md:px-4">
      <TabNav label={`${brand.name}`} items={tabs.map((t) => ({ href: t.href, label: t.label, current: t.id === at }))} className="min-w-0 flex-1" />
      {children}
    </div>
  );
}
