"use client";

import { useEffect, useState } from "react";
import { IconSearch } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import { Body } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { PublicGrid } from "@/components/public-grid";
import { type Site, useSite } from "@/components/site/site-context";
import type { Media, PageView } from "@/lib/site";

/**
 * Live assets from the library, as the server found them for this section
 * (core/section-assets.ts), in the portal's grid and lightbox. With
 * `downloads: false` they are only to look at. A query the library refuses
 * leaves the section empty for readers; the builder says why.
 *
 * Readers search it: what is on the page narrows at once as they type, then
 * the server's answer for the whole collection follows (the view asked
 * again with `in` and `find`: the portal's site on a portal, the brand's view
 * in the app), so a match beyond the first page of assets is found too.
 * ponytail: every layout draws the grid; masonry and list when W4 or W7 asks.
 */
export function CollectionSection({ section: s }: SectionProps) {
  const site = useSite();
  const { view, mode } = site;
  const found = view.collections[s.id];
  const bare = s.props.downloads === false;
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState<{ q: string; got: Found | null } | null>(null);
  const words = q.trim();

  // The whole collection's answer, a moment after the last key; a newer search calls off an older one.
  useEffect(() => {
    if (!words) return;
    const ac = new AbortController();
    const t = setTimeout(() => {
      void searchIn(site, s.id, words, ac.signal).then((got) => {
        if (!ac.signal.aborted) setAsked({ q: words, got });
      });
    }, 250);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
    // `site` changes with every view; the page and its section are what the answer is for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words, s.id, view.brand.slug, view.page?.slug, site.context, view.lang]);

  const answered = words && asked?.q === words && asked.got;
  // Until the server answers, what is on the page, narrowed here.
  const list = !words ? (found?.items ?? []) : answered ? answered.items : (found?.items ?? []).filter((m) => matches(m, words));
  const total = !words ? (found?.total ?? 0) : answered ? answered.total : list.length;
  const busy = !!words && !answered;
  const items = list.map((a) => (bare ? { ...a, downloads: [] } : a));
  const searchable = (found?.total ?? 0) > 1;

  return (
    <div className="space-y-6">
      <Body />
      {mode === "edit" && found?.error && <p className="text-destructive text-sm">Readers see nothing here: {found.error}</p>}
      {mode === "edit" && found && !found.error && found.total === 0 && (
        <p className="text-muted-foreground text-sm">
          Nothing in the library matches yet, so readers see nothing here. Change what it shows in the section&apos;s options; approved assets that match appear as they come.
        </p>
      )}
      {searchable && (
        <div role="search" className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-sm">
            <IconSearch aria-hidden className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 opacity-60" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${found!.total} ${found!.total === 1 ? "asset" : "assets"}`}
              aria-label={`Search ${s.title || "these assets"}`}
              className="h-9 w-full rounded-(--brand-radius,0.5rem) border border-current/15 bg-transparent ps-8 pe-8 text-sm outline-none placeholder:opacity-60 focus-visible:ring-2 focus-visible:ring-(--brand-accent)"
            />
            {busy && <Spinner aria-hidden className="absolute end-2.5 top-1/2 size-4 -translate-y-1/2 opacity-60" />}
          </div>
          {words && (
            <p role="status" className="text-sm tabular-nums opacity-70">
              {busy ? "Searching…" : total === 1 ? "1 match" : `${total} matches`}
            </p>
          )}
        </div>
      )}
      {items.length > 0 && <PublicGrid items={items} busy={busy} />}
      {words && !busy && items.length === 0 && <p className="text-sm opacity-70">Nothing here matches &ldquo;{words}&rdquo;.</p>}
      {total > items.length && (
        <p className="text-muted-foreground text-sm tabular-nums">
          {items.length} of {total}
        </p>
      )}
    </div>
  );
}

type Found = { items: Media[]; total: number };

/** Every word in the asset's title, file name or description. */
function matches(m: Media, words: string) {
  const text = `${m.title ?? ""} ${m.filename} ${m.description ?? ""}`.toLowerCase();
  return words
    .toLowerCase()
    .split(/\s+/)
    .every((w) => text.includes(w));
}

/**
 * The section's assets for `words`, from the server: the portal's site with
 * the visitor's headers on a portal, the brand's view in the app (as the
 * builder sees it while editing). Null when it can't be asked: the page's own
 * assets, narrowed, stay.
 */
async function searchIn(site: Site, section: string, words: string, signal: AbortSignal): Promise<Found | null> {
  const { view, portal, mode, context } = site;
  const page = view.page?.slug;
  if (!page) return null;
  const q = new URLSearchParams({ in: section, find: words, ...(context && { context }), ...(view.lang && { lang: view.lang }) });
  try {
    if (portal) {
      q.set("path", `${view.brand.slug}/${page}`);
      const res = await fetch(`/api/v1/portal/${encodeURIComponent(portal.slug)}/site?${q}`, { headers: portal.headers?.(), cache: "no-store", signal });
      if (!res.ok) return null;
      return ((await res.json()) as { data: { view: PageView | null } }).data.view?.collections[section] ?? null;
    }
    q.set("page", page);
    if (mode === "edit") q.set("edit", "1");
    const res = await fetch(`/api/v1/brands/${encodeURIComponent(view.brand.slug)}/view?${q}`, { cache: "no-store", signal });
    if (!res.ok) return null;
    return ((await res.json()) as { data: PageView }).data.collections[section] ?? null;
  } catch {
    return null;
  }
}
