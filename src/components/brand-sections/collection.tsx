"use client";

import { Body } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { PublicGrid } from "@/components/public-grid";
import { useSite } from "@/components/site/site-context";

/**
 * Live assets from the library, as the server found them for this section
 * (core/section-assets.ts), in the portal's grid and lightbox. With
 * `downloads: false` they are only to look at. A query the library refuses
 * leaves the section empty for readers; the builder says why.
 * ponytail: every layout draws the grid; masonry and list when W4 or W7 asks.
 */
export function CollectionSection({ section: s }: SectionProps) {
  const { view, mode } = useSite();
  const found = view.collections[s.id];
  const bare = s.props.downloads === false;
  const items = (found?.items ?? []).map((a) => (bare ? { ...a, downloads: [] } : a));
  return (
    <div className="space-y-6">
      <Body />
      {mode === "edit" && found?.error && <p className="text-destructive text-sm">Readers see nothing here: {found.error}</p>}
      {items.length > 0 && <PublicGrid items={items} />}
      {found && found.total > items.length && (
        <p className="text-muted-foreground text-sm tabular-nums">
          {items.length} of {found.total}
        </p>
      )}
    </div>
  );
}
