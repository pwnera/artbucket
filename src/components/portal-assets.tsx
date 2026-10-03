"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { IconSearch } from "@tabler/icons-react";
import { Spinner } from "@/components/ui/spinner";
import { HEAD, LABEL } from "@/components/brand-sections/look";
import { LocalDate, PublicGrid, type PublicItem } from "@/components/public-grid";
import { Thumb } from "@/components/thumb";
import { PoweredBy, SiteFooter } from "@/components/site/footer";
import { type BrandLook, Looked, Opening } from "@/components/site/looked";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import type { PortalSite } from "@/lib/portal";
import { cn } from "@/lib/utils";

export type Theme = { logo: string | null; logoDark?: string | null; accent: string | null; background: string | null; icon?: string | null; product?: string };
export type Access = "password" | "members";
type Download = { preset: string; label: string; hint: string; url: string; filename: string };
type Item = Omit<PublicItem, "downloads" | "original"> & { downloads: Download[] };
export type AssetsView = {
  portal: {
    slug: string;
    name: string;
    intro: string | null;
    organization: string;
    access: "public" | Access;
    expiresAt: string | null;
    theme: Theme;
    /** `covers`: its newest pictures' thumbnails, signed, for its card. */
    collections: { id: string; name: string; count: number; covers: string[] }[];
    brands: { slug: string; name: string; publishedAt: string | null }[];
    site: PortalSite;
    /** The first brand's look (lib/core/page-view.ts viewLook); with no brand, the portal's accent over the app's own. */
    look: BrandLook;
    madeWith?: boolean;
  };
  data: Item[];
  total: number;
};

/** GET /api/v1/portal/{slug}'s body, whatever its status: the page's server render passes the first one. */
export type PortalBody = Partial<AssetsView> & {
  error?: { code?: string; message?: string; detail?: { name?: string; access?: Access; theme?: Theme } };
};

const PAGE = 60;
const queryKey = (q: string, collection: string | null) => `${q.trim()}\n${collection ?? ""}`;

/** The original's inline address, from its download: a video plays from it, "Open original" opens it. */
const withOriginal = (a: Item): PublicItem => ({ ...a, original: a.downloads.find((d) => d.preset === "original")?.url.replace("?download&", "?") ?? null });

/**
 * A portal's Assets view (D16): its collections' files, searchable, from GET
 * /api/v1/portal/{slug}. It shows at ?view=assets beside the brand's pages,
 * and wears that brand's site: its faces, colors, corners and opening, its
 * footer. A portal with no brand is this view alone, in the portal's accent.
 * `header` is the host's bar above it; `base` and `onNavigate` are how the
 * footer's links move within the portal. A door or a closed portal met while
 * searching goes to `onLost`; the host shows it.
 */
export function PortalAssets({
  slug,
  base,
  initial,
  q: firstQ = "",
  collection: firstCollection = null,
  asset = null,
  headers,
  header,
  onNavigate,
  onLost,
}: {
  slug: string;
  base: string;
  initial: AssetsView;
  q?: string;
  collection?: string | null;
  /** From ?asset=: open in the lightbox. */
  asset?: string | null;
  headers: () => HeadersInit;
  header?: React.ReactNode;
  onNavigate?: (href: string) => void;
  onLost: (body: PortalBody) => void;
}) {
  const [view, setView] = useState(initial);
  const [q, setQ] = useState(firstQ);
  const [collection, setCollection] = useState(firstCollection);
  const [pending, setPending] = useState(false);
  const [more, setMore] = useState(false);
  const fetched = useRef(queryKey(firstQ, firstCollection));
  /** What the list on screen answers: its words say that, not what is being typed. */
  const [shown, setShown] = useState({ q: firstQ.trim(), collection: firstCollection });
  /** The newest load: only it may say what shows. */
  const loads = useRef(0);
  const search = useRef<HTMLInputElement>(null);
  /** "Can I use this?" on an open file, through the same door as the portal. */
  const ask = (id: string, use: object) => {
    const h = new Headers(headers());
    h.set("Content-Type", "application/json");
    return fetch(`/api/v1/portal/${slug}/check`, { method: "POST", headers: h, body: JSON.stringify({ asset: id, ...use }) });
  };

  const fetchPage = useCallback(
    async (offset: number, signal?: AbortSignal) => {
      const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
      if (q.trim()) params.set("q", q.trim());
      if (collection) params.set("collection", collection);
      const res = await fetch(`/api/v1/portal/${slug}?${params}`, { headers: headers(), cache: "no-store", signal });
      return { res, body: (await res.json().catch(() => ({}))) as PortalBody };
    },
    [slug, q, collection, headers],
  );

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const k = queryKey(q, collection);
      const n = ++loads.current;
      setPending(true);
      try {
        const { res, body } = await fetchPage(0, signal);
        if (signal?.aborted) return;
        if (res.ok) {
          fetched.current = k;
          setShown({ q: q.trim(), collection });
          return setView(body as AssetsView);
        }
        const code = body.error?.code;
        if (code === "password" || code === "gone") return onLost(body);
        // Browsing, a passing failure keeps what's on screen.
        toast.error(body.error?.message ?? "That didn't load. Try again in a moment.");
      } catch {
        if (!signal?.aborted) toast.error("Couldn't reach the portal. Check the connection and try again.");
      } finally {
        if (n === loads.current) setPending(false);
      }
    },
    [fetchPage, q, collection, onLost],
  );

  const brands = view.portal.brands.length;
  useEffect(() => {
    // The address says what's shown, so a filtered view can be linked to; beside brand pages, it says Assets.
    const url = new URL(window.location.href);
    if (brands) url.searchParams.set("view", "assets");
    if (q.trim()) url.searchParams.set("q", q.trim());
    else url.searchParams.delete("q");
    if (collection) url.searchParams.set("collection", collection);
    else url.searchParams.delete("collection");
    history.replaceState(null, "", url);
    if (queryKey(q, collection) === fetched.current) return;
    // Search waits for typing to pause; a new collection goes at once. A newer one cancels it.
    const ctl = new AbortController();
    const t = setTimeout(() => void load(ctl.signal), q ? 250 : 0);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [load, q, collection, brands]);

  useEffect(() => {
    // "/" searches, as on most sites with a search box; typing in a field stays typing.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || !search.current) return;
      if (e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable]:not([contenteditable=false])")) return;
      e.preventDefault();
      search.current.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { portal, data, total } = view;
  const home = base || "/";
  const href = useCallback(() => home, [home]);
  const inCollection = portal.collections.find((c) => c.id === shown.collection);
  const words = shown.q;
  return (
    <Looked look={portal.look} name={portal.name} href={href} portal={slug} headers={headers} before={header}>
      <Opening
        eyebrow={portal.look.brand ? portal.name : portal.organization}
        title={portal.look.brand ? "Assets" : portal.name}
        lede={portal.intro ?? (portal.look.brand ? `Files from ${portal.organization}, ready to download.` : null)}
      >
        <div className="relative max-w-2xl">
          <span className="text-(--brand-muted) pointer-events-none absolute start-4 top-1/2 -translate-y-1/2">
            {pending ? <Spinner className="size-5" /> : <IconSearch className="size-5" />}
          </span>
          <Input
            ref={search}
            type="search"
            placeholder={`Search ${portal.collections.find((c) => c.id === collection)?.name ?? portal.name}`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            // The page's own field on whatever ground the opening is: a band, a tint, the page.
            className="h-12 rounded-[var(--brand-radius,var(--radius-lg))] border-(--brand-line) bg-(--brand-surface) ps-12 text-base text-(--brand-ink) shadow-sm placeholder:text-(--brand-muted) sm:pe-12 md:text-base"
            aria-label="Search"
          />
          {!q && <Kbd keys={["/"]} className="pointer-events-none absolute end-4 top-1/2 hidden -translate-y-1/2 sm:inline-flex" />}
        </div>
        {portal.expiresAt && (
          <p className="text-muted-foreground text-sm">
            Open until <LocalDate at={portal.expiresAt} />
          </p>
        )}
      </Opening>

      {portal.collections.length > 1 && (
        <div className="bg-background sticky top-0 z-10 border-b">
          <nav aria-label="Collections" className="mx-auto flex w-full max-w-280 gap-6 overflow-x-auto px-6 [scrollbar-width:none] @3xl/site:px-10">
            <Tab active={!collection} onClick={() => setCollection(null)}>
              All
            </Tab>
            {portal.collections.map((c) => (
              <Tab key={c.id} active={collection === c.id} count={c.count} onClick={() => setCollection(c.id)}>
                {c.name}
              </Tab>
            ))}
          </nav>
        </div>
      )}

      <main className="mx-auto w-full max-w-280 flex-1 space-y-6 px-6 pt-8 pb-[calc(var(--brand-gap)*2)] @3xl/site:px-10">
        {!q.trim() && !collection && portal.collections.length > 1 && <Collections collections={portal.collections} onPick={setCollection} />}
        <p aria-live="polite" className={cn(LABEL, "text-muted-foreground", !total && "sr-only")}>
          {words
            ? `${total} ${total === 1 ? "match" : "matches"} for “${words}”`
            : `${total} ${total === 1 ? "file" : "files"}${inCollection ? ` in ${inCollection.name}` : ""}`}
        </p>
        {data.length ? (
          <PublicGrid items={data.map(withOriginal)} asset={asset} busy={pending} ask={ask} />
        ) : (
          <Empty
            size="sm"
            aria-busy={pending || undefined}
            className={cn("rounded-[var(--brand-radius,var(--radius-xl))] border border-dashed py-16 transition-opacity", pending && "opacity-60")}
          >
            <EmptyHeader>
              <EmptyTitle className={HEAD}>
                {words ? `No files match “${words}”` : inCollection ? `Nothing in ${inCollection.name} yet` : "Nothing to download here yet"}
              </EmptyTitle>
              <EmptyDescription>{words ? "Try fewer words, or another collection." : "Check back soon."}</EmptyDescription>
            </EmptyHeader>
            {words && (
              <EmptyContent>
                <Button variant="outline" onClick={() => (setQ(""), search.current?.focus())}>
                  Clear search
                </Button>
              </EmptyContent>
            )}
          </Empty>
        )}
        {data.length < total && (
          <div className="flex flex-col items-center gap-2 pt-4">
            <p className="text-muted-foreground text-sm tabular-nums">
              {data.length} of {total}
            </p>
            <Button
              variant="outline"
              pending={more}
              onClick={async () => {
                setMore(true);
                // A search or collection picked meanwhile owns the list: this page belongs to the old one.
                const k = queryKey(q, collection);
                try {
                  const { res, body } = await fetchPage(data.length);
                  if (fetched.current !== k) return;
                  if (res.ok) setView((v) => ({ ...(body as AssetsView), data: [...v.data, ...(body.data ?? [])] }));
                  else toast.error(body.error?.message ?? "That didn't load. Try again in a moment.");
                } catch {
                  toast.error("Couldn't reach the portal. Check the connection and try again.");
                } finally {
                  setMore(false);
                }
              }}
            >
              Show more
            </Button>
          </div>
        )}
      </main>

      {portal.look.brand ? (
        <SiteFooter portal={portal} base={base} onNavigate={onNavigate} />
      ) : (
        <footer className="text-muted-foreground border-t text-sm">
          <div className="mx-auto flex w-full max-w-280 flex-wrap justify-between gap-x-6 gap-y-1 px-6 py-8 @3xl/site:px-10">
            <p>{portal.organization}</p>
            {portal.expiresAt && (
              <p>
                Open until <LocalDate at={portal.expiresAt} />
              </p>
            )}
            {portal.madeWith && <PoweredBy slug={portal.slug} />}
          </div>
        </footer>
      )}
    </Looked>
  );
}

/** A collection, as the site's tabs are drawn: the line under the one showing. */
function Tab({ active, count, onClick, children }: { active: boolean; count?: number; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="text-muted-foreground hover:text-foreground aria-pressed:border-primary aria-pressed:text-foreground focus-visible:ring-ring/50 -mb-px flex shrink-0 items-center gap-1.5 border-b-2 border-transparent py-3 text-sm font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2"
    >
      {children}
      {count !== undefined && <span className="text-muted-foreground text-xs font-normal tabular-nums">{count}</span>}
    </button>
  );
}

/** The collections as cards, each over its newest pictures: a way in before the whole list. */
function Collections({ collections, onPick }: { collections: AssetsView["portal"]["collections"]; onPick: (id: string) => void }) {
  return (
    <section aria-label="Collections" className="space-y-4 pb-4">
      <h2 className={cn(LABEL, "text-muted-foreground")}>Collections</h2>
      <ul className="grid grid-cols-2 gap-4 @3xl/site:grid-cols-3 @6xl/site:grid-cols-4">
        {collections.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onPick(c.id)}
              className="group/card focus-visible:ring-ring/50 block w-full rounded-[var(--brand-radius,var(--radius-xl))] text-start outline-none focus-visible:ring-2"
            >
              <span
                aria-hidden
                className={cn(
                  "bg-muted grid aspect-[4/3] gap-0.5 overflow-hidden rounded-[var(--brand-radius,var(--radius-xl))] border shadow-xs transition-[box-shadow,translate] duration-200 group-hover/card:-translate-y-0.5 group-hover/card:shadow-lg motion-reduce:group-hover/card:translate-y-0",
                  c.covers.length === 3 && "grid-cols-[2fr_1fr] grid-rows-2",
                  c.covers.length === 2 && "grid-cols-2",
                )}
              >
                {c.covers.length ? (
                  c.covers.map((src, i) => (
                    <span key={src} className={cn("relative", c.covers.length === 3 && i === 0 && "row-span-2")}>
                      <Thumb src={src.replace("/w_640,", i ? "/w_240," : "/w_480,")} alt="" className="object-cover p-0" />
                    </span>
                  ))
                ) : (
                  // No picture yet: its initial, large, on a wash of the accent.
                  <span className="flex items-center justify-center bg-[color-mix(in_oklab,var(--primary)_10%,var(--muted))] text-5xl text-(--brand-accent) [font-family:var(--brand-head,var(--font-display))] font-semibold">
                    {c.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </span>
              <span className={cn(HEAD, "mt-3 block truncate text-base")}>{c.name}</span>
              <span className="text-muted-foreground block text-sm tabular-nums">
                {c.count} {c.count === 1 ? "file" : "files"}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
