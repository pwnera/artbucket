"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { IconLoader2, IconSearch } from "@tabler/icons-react";
import { ThemeToggle } from "@/components/brand";
import { Markdown } from "@/components/brand-values";
import { LocalDate, PublicGrid, type PublicItem } from "@/components/public-grid";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { inkOn } from "@/lib/color";
import { cn } from "@/lib/utils";

export type Theme = { logo: string | null; accent: string | null; background: string | null; icon?: string | null; product?: string };
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
    collections: { id: string; name: string; count: number }[];
    brands: { slug: string; name: string }[];
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
 * /api/v1/portal/{slug}, under the portal's hero. It shows at ?view=assets,
 * and is the whole portal when it carries no brand. `nav` goes in the bar
 * under the hero: the way to the portal's brand pages. A door or a closed
 * portal met while searching goes to `onLost`; the host shows it.
 */
export function PortalAssets({
  slug,
  initial,
  q: firstQ = "",
  collection: firstCollection = null,
  asset = null,
  headers,
  nav,
  onLost,
}: {
  slug: string;
  initial: AssetsView;
  q?: string;
  collection?: string | null;
  /** From ?asset=: open in the lightbox. */
  asset?: string | null;
  headers: () => HeadersInit;
  nav?: React.ReactNode;
  onLost: (body: PortalBody) => void;
}) {
  const [view, setView] = useState(initial);
  const [q, setQ] = useState(firstQ);
  const [collection, setCollection] = useState(firstCollection);
  const [pending, setPending] = useState(false);
  const [more, setMore] = useState(false);
  const fetched = useRef(queryKey(firstQ, firstCollection));
  /** The newest load: only it may say what shows. */
  const loads = useRef(0);
  const search = useRef<HTMLInputElement>(null);
  const hero = useRef<HTMLElement>(null);
  const [past, setPast] = useState(false);

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

  useEffect(() => {
    // The bar's small logo shows once the hero's big one has scrolled away.
    const el = hero.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setPast(!e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const { portal, data, total } = view;
  const inCollection = portal.collections.find((c) => c.id === collection);
  return (
    <>
      <Hero ref={hero} name={portal.name} intro={portal.intro} theme={portal.theme} organization={portal.organization} />
      {nav && (
        <div className="bg-background/85 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-10 border-b backdrop-blur">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 sm:px-8">
            {past &&
              (portal.theme.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={portal.theme.logo} alt={portal.organization} className="animate-in fade-in-0 h-6 w-auto max-w-24 shrink-0 object-contain duration-150" />
              ) : (
                <span className="animate-in fade-in-0 shrink-0 text-sm font-semibold duration-150">{portal.name}</span>
              ))}
            {nav}
          </div>
        </div>
      )}
      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-8">
        <div className="relative">
          <span className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 -translate-y-1/2">
            {pending ? <IconLoader2 className="size-4 animate-spin" /> : <IconSearch className="size-4" />}
          </span>
          <Input
            ref={search}
            type="search"
            placeholder={`Search ${portal.name}`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="ps-9 sm:pe-10"
            aria-label="Search"
          />
          {!q && <Kbd keys={["/"]} className="pointer-events-none absolute end-3 top-1/2 hidden -translate-y-1/2 sm:inline-flex" />}
        </div>
        {portal.collections.length > 1 && (
          <nav className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Collections">
            <Chip active={!collection} onClick={() => setCollection(null)}>
              All
            </Chip>
            {portal.collections.map((c) => (
              <Chip key={c.id} active={collection === c.id} onClick={() => setCollection(c.id)}>
                {c.name} <span className="opacity-60">{c.count}</span>
              </Chip>
            ))}
          </nav>
        )}
        <p aria-live="polite" className={cn("text-muted-foreground text-sm", !total && "sr-only")}>
          {total} {total === 1 ? "file" : "files"}
        </p>
        {data.length ? (
          <PublicGrid items={data.map(withOriginal)} asset={asset} busy={pending} />
        ) : (
          <Empty size="sm" aria-busy={pending || undefined} className={cn("transition-opacity", pending && "opacity-60")}>
            <EmptyHeader>
              <EmptyTitle>{q.trim() ? `No files match “${q.trim()}”` : inCollection ? `Nothing in ${inCollection.name} yet` : "Nothing to download here yet"}</EmptyTitle>
              {!q.trim() && <EmptyDescription>Check back soon.</EmptyDescription>}
            </EmptyHeader>
            {q.trim() && (
              <EmptyContent>
                <Button variant="link" onClick={() => (setQ(""), search.current?.focus())}>
                  Clear search
                </Button>
              </EmptyContent>
            )}
          </Empty>
        )}
        {data.length < total && (
          <div className="text-center">
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
      <footer className="text-muted-foreground border-t py-6 text-center text-xs">
        {portal.organization}
        {portal.expiresAt && (
          <>
            {" "}
            · open until <LocalDate at={portal.expiresAt} />
          </>
        )}
      </footer>
    </>
  );
}

function Hero({ ref, name, intro, theme, organization }: { ref?: React.Ref<HTMLElement>; name: string; intro: string | null; theme: Theme; organization: string }) {
  const ink = theme.background ? inkOn(theme.background) : undefined;
  return (
    <header
      ref={ref}
      // Unset, the band is the accent, faint: every portal looks like its brand, not like the app.
      className={cn("border-b", !theme.background && "bg-[color-mix(in_oklab,var(--primary)_7%,var(--background))]")}
      style={theme.background ? { background: theme.background, color: ink } : undefined}
    >
      <div className="mx-auto flex w-full max-w-6xl items-start gap-4 px-4 pt-10 pb-12 sm:px-8 sm:pt-14">
        <div className="min-w-0 flex-1 space-y-4">
          {theme.logo ? (
            // A rendition already sized for this: next/image would only resize it again.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={theme.logo} alt={organization} className="h-10 w-auto max-w-[240px] object-contain object-left sm:h-12" />
          ) : (
            <p className="text-sm font-semibold opacity-80">{organization}</p>
          )}
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{name}</h1>
          {intro && <Markdown text={intro} className="max-w-2xl text-base opacity-80" />}
        </div>
        {/* On a painted header the toggle keeps the header's ink, hovered or not. */}
        <ThemeToggle className={cn(ink && "hover:bg-current/10 hover:text-current dark:hover:bg-current/10 dark:hover:text-current")} />
      </div>
    </header>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 snap-start rounded-full border px-3 py-1 text-sm whitespace-nowrap transition-colors",
        active ? "bg-primary text-primary-foreground border-transparent" : "hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
