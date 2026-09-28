"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { IconCircleCheck, IconLoader2, IconLock, IconRefresh, IconSearch, IconSend } from "@tabler/icons-react";
import { ThemeToggle, useAccent } from "@/components/brand";
import { Guidelines } from "@/components/brand-editor";
import { Markdown } from "@/components/brand-values";
import { LocalDate, PublicGrid, type PublicItem } from "@/components/public-grid";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { addSignatures } from "@/lib/asset-url";
import { inkOn } from "@/lib/color";
import type { Rule } from "@/lib/rules";
import { cn } from "@/lib/utils";

type Theme = { logo: string | null; accent: string | null; background: string | null; icon?: string | null; product?: string };
type Download = { preset: string; label: string; hint: string; url: string; filename: string };
type Item = Omit<PublicItem, "downloads" | "original"> & { downloads: Download[] };
type Access = "password" | "members";
type View = {
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
export type PortalBody = Partial<View> & {
  error?: { code?: string; message?: string; detail?: { name?: string; access?: Access; theme?: Theme } };
};

type Gated = { at: "gate"; name: string; access: Access; theme: Theme; wrong: boolean; note?: string };
type State = { at: "loading" } | { at: "error"; title: string; message: string; retry?: boolean } | Gated | { at: "open"; view: View };
type Pass = { password?: string; key?: string };
type Guide = { brand: { name: string }; data: Rule[] };

const PAGE = 60;
const NO_THEME: Theme = { logo: null, accent: null, background: null };
const queryKey = (q: string, collection: string | null) => `${q.trim()}\n${collection ?? ""}`;

/**
 * What a response means for the page. `wrong`: a password was just typed, so
 * a refusal says it isn't right. `was` is what showed before, for a refusal
 * that doesn't say whose door it is.
 */
function next(body: PortalBody, wrong: boolean, was: State): State {
  if (body.portal) return { at: "open", view: body as View };
  const e = body.error ?? {};
  if (e.code === "password") {
    return { at: "gate", name: e.detail?.name ?? "Portal", access: e.detail?.access ?? "password", theme: e.detail?.theme ?? NO_THEME, wrong };
  }
  if (e.code === "rate_limited" && was.at === "gate") return { ...was, wrong: false, note: e.message };
  if (e.code === "gone") return { at: "error", title: "This portal has closed", message: "Ask whoever sent you here for another way in." };
  if (e.code === "not_found") return { at: "error", title: "There is no portal here", message: "Check the address, or ask whoever sent it." };
  return { at: "error", title: "This portal didn't open", message: e.message ?? "Something went wrong on our side. Try again in a moment.", retry: true };
}

// Storage can refuse (a private window, blocked site data); nothing here depends on it.
function recall(k: string) {
  let v: string | null = null;
  try {
    v = localStorage.getItem(k);
  } catch {}
  try {
    v ??= sessionStorage.getItem(k);
  } catch {}
  return v ?? undefined;
}

/** `lasting` tries localStorage first, then this tab's; null forgets it in both. */
function remember(k: string, v: string | null, lasting = false) {
  for (const s of lasting || v === null ? ["localStorage", "sessionStorage"] : ["sessionStorage"]) {
    try {
      const store = window[s as "localStorage" | "sessionStorage"];
      if (v === null) store.removeItem(k);
      else return store.setItem(k, v);
    } catch {}
  }
}

/** The original's inline address, from its download: a video plays from it, "Open original" opens it. */
const withOriginal = (a: Item): PublicItem => ({ ...a, original: a.downloads.find((d) => d.preset === "original")?.url.replace("?download&", "?") ?? null });

/**
 * /p/{slug}, or a portal's own domain: a brand portal, for visitors outside
 * the team. Everything comes from GET /api/v1/portal/{slug}, like any
 * client's; the server renders the first page (`initial`), so the portal
 * paints at once in its own look. A password stays in this tab once it
 * worked; the key from an approved request's link is kept for next time.
 */
export function PortalView({
  slug,
  initial,
  q: firstQ = "",
  collection: firstCollection = null,
  brand: linked = null,
  asset = null,
  ownDomain = false,
}: {
  slug: string;
  initial: PortalBody | null;
  q?: string;
  collection?: string | null;
  /** A brand's slug from ?brand=, for its tab. */
  brand?: string | null;
  /** From ?asset=: open in the lightbox. */
  asset?: string | null;
  /** Served at the portal's own domain, where signing in can't work. */
  ownDomain?: boolean;
}) {
  const [state, setState] = useState<State>(() => (initial ? next(initial, false, { at: "loading" }) : { at: "loading" }));
  const [q, setQ] = useState(firstQ);
  const [collection, setCollection] = useState(firstCollection);
  const [brand, setBrand] = useState(linked);
  const [pending, setPending] = useState(false);
  /** Trying a kept password or key on a door the server showed: a skeleton, not the door. */
  const [checking, setChecking] = useState(false);
  const [more, setMore] = useState(false);
  const [guides] = useState(() => new Map<string, Guide>());
  const pass = useRef<Pass>({});
  const latest = useRef(state);
  const fetched = useRef(queryKey(firstQ, firstCollection));
  /** The newest load: only it may say the page stopped working. */
  const loads = useRef(0);
  const search = useRef<HTMLInputElement>(null);
  const hero = useRef<HTMLElement>(null);
  const [past, setPast] = useState(false);
  const store = `portal:${slug}`;

  useEffect(() => {
    latest.current = state;
  });

  const headers = useCallback((): HeadersInit => {
    const h: Record<string, string> = {};
    if (pass.current.password) h["X-Portal-Password"] = pass.current.password;
    if (pass.current.key) h["X-Portal-Key"] = pass.current.key;
    return h;
  }, []);

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
    async (signal?: AbortSignal, typed = false) => {
      const sent = { ...pass.current };
      const was = latest.current;
      const k = queryKey(q, collection);
      const n = ++loads.current;
      setPending(true);
      try {
        const { res, body } = await fetchPage(0, signal);
        if (signal?.aborted) return;
        if (res.ok) {
          if (sent.password) remember(`${store}:password`, sent.password);
          fetched.current = k;
          return setState({ at: "open", view: body as View });
        }
        const code = body.error?.code;
        if (code === "password") {
          // Wrong, so never kept; a key that no longer opens it has lapsed.
          if (sent.password) {
            pass.current.password = undefined;
            remember(`${store}:password`, null);
          } else if (sent.key) {
            pass.current.key = undefined;
            remember(`${store}:key`, null);
          }
        }
        // Browsing, a passing failure keeps what's on screen.
        if (was.at === "open" && code !== "password" && code !== "gone") {
          toast.error(body.error?.message ?? "That didn't load. Try again in a moment.");
          return;
        }
        setState(next(body, typed && !!sent.password, was));
      } catch {
        if (signal?.aborted) return;
        const offline = "Couldn't reach the portal. Check the connection and try again.";
        if (was.at === "open") toast.error(offline);
        // At the door, the door stays, saying why.
        else if (was.at === "gate") setState({ ...was, wrong: false, note: offline });
        else setState({ at: "error", title: "Couldn't reach the portal", message: "Check the connection and try again.", retry: true });
      } finally {
        if (n === loads.current) setPending(false);
      }
    },
    [fetchPage, q, collection, store],
  );

  useEffect(() => {
    // A key arrives in the link (?key=), is kept for next time, and leaves the address bar.
    const url = new URL(window.location.href);
    const link = url.searchParams.get("key");
    if (link) {
      remember(`${store}:key`, link, true);
      url.searchParams.delete("key");
      history.replaceState(null, "", url);
    }
    pass.current = { key: link ?? recall(`${store}:key`), password: recall(`${store}:password`) };
    // The server rendered what anyone sees; only a door may open wider for what this browser kept.
    const now = latest.current;
    if (now.at === "loading" || (now.at === "gate" && (pass.current.key || pass.current.password))) {
      setChecking(true);
      void load().finally(() => setChecking(false));
    }
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // The address says what's shown, so a filtered view can be linked to.
    const url = new URL(window.location.href);
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
  }, [load, q, collection]);

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

  const opened = state.at === "open";
  useEffect(() => {
    // The bar's small logo shows once the hero's big one has scrolled away.
    const el = hero.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setPast(!e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [opened]);

  if (state.at === "loading" || (checking && state.at === "gate")) {
    return (
      <Shell theme={state.at === "gate" ? state.theme : null}>
        <PortalSkeleton />
      </Shell>
    );
  }
  if (state.at === "error") {
    return (
      <Shell theme={null}>
        <div className="mx-auto max-w-md px-4 py-24 text-center">
          <h1 className="text-xl font-semibold">{state.title}</h1>
          <p className="text-muted-foreground mt-2 text-sm">{state.message}</p>
          {state.retry && (
            <Button variant="outline" className="mt-6" pending={pending} onClick={() => void load()}>
              <IconRefresh /> Try again
            </Button>
          )}
        </div>
      </Shell>
    );
  }
  if (state.at === "gate") {
    return (
      <Shell theme={state.theme}>
        <Gate
          slug={slug}
          state={state}
          ownDomain={ownDomain}
          onPassword={(p) => {
            pass.current.password = p;
            return load(undefined, true);
          }}
        />
      </Shell>
    );
  }

  const { portal, data, total } = state.view;
  // Assets when it has collections; a portal of guidelines alone opens on its first brand.
  const tabs = [...(portal.collections.length ? [{ id: "", name: "Assets" }] : []), ...portal.brands.map((b) => ({ id: b.slug, name: b.name }))];
  const at = tabs.find((t) => t.id === (brand ?? ""))?.id ?? tabs[0]?.id ?? "";
  const pick = (id: string) => {
    setBrand(id || null);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("brand", id);
    else url.searchParams.delete("brand");
    history.replaceState(null, "", url);
  };
  const inCollection = portal.collections.find((c) => c.id === collection);
  return (
    <Shell theme={portal.theme}>
      <Hero ref={hero} name={portal.name} intro={portal.intro} theme={portal.theme} organization={portal.organization} />
      {tabs.length > 1 && (
        <div className="bg-background/85 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-10 border-b backdrop-blur">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 sm:px-8">
            {past &&
              (portal.theme.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={portal.theme.logo} alt={portal.organization} className="animate-in fade-in-0 h-6 w-auto max-w-24 shrink-0 object-contain duration-150" />
              ) : (
                <span className="animate-in fade-in-0 shrink-0 text-sm font-semibold duration-150">{portal.name}</span>
              ))}
            <nav aria-label="What this portal shows" className="-mb-px flex min-w-0 flex-1 gap-5 overflow-x-auto">
              {tabs.map((t) => (
                <a
                  key={t.id || "assets"}
                  href={t.id ? `?brand=${encodeURIComponent(t.id)}` : "?"}
                  aria-current={at === t.id ? "page" : undefined}
                  onClick={(e) => {
                    // A new tab or window keeps the browser's way; a plain click stays on the page.
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                    e.preventDefault();
                    pick(t.id);
                  }}
                  className={cn(
                    "shrink-0 border-b-2 py-3 text-sm transition-colors outline-offset-[-2px]",
                    at === t.id ? "border-primary text-foreground font-medium" : "text-muted-foreground hover:text-foreground border-transparent",
                  )}
                >
                  {t.name}
                </a>
              ))}
            </nav>
          </div>
        </div>
      )}
      {at ? (
        <BrandTab key={at} slug={slug} brand={at} headers={headers} guides={guides} />
      ) : (
        <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-8">
          <div className="relative">
            <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2">
              {pending ? <IconLoader2 className="size-4 animate-spin" /> : <IconSearch className="size-4" />}
            </span>
            <Input
              ref={search}
              type="search"
              placeholder={`Search ${portal.name}`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9 sm:pr-10"
              aria-label="Search"
            />
            {!q && <Kbd keys={["/"]} className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 sm:inline-flex" />}
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
                    if (res.ok)
                      setState((s) => (s.at === "open" ? { at: "open", view: { ...(body as View), data: [...s.view.data, ...(body.data ?? [])] } } : s));
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
      )}
      <footer className="text-muted-foreground border-t py-6 text-center text-xs">
        {portal.organization}
        {portal.expiresAt && (
          <>
            {" "}
            · open until <LocalDate at={portal.expiresAt} />
          </>
        )}
      </footer>
    </Shell>
  );
}

function PortalSkeleton() {
  return (
    <div role="status" aria-label="Opening the portal">
      <div className="border-b">
        <div className="mx-auto w-full max-w-6xl space-y-4 px-4 pt-10 pb-12 sm:px-8 sm:pt-14">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-9 w-72 max-w-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
      </div>
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-8">
        <Skeleton className="h-9 w-full" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * One of the portal's brands: its guidelines, read-only, from GET
 * /api/v1/portal/{slug}/brands/{brand}. Kept in `guides` once read, so
 * switching back shows it at once while it refreshes behind.
 */
function BrandTab({ slug, brand, headers, guides }: { slug: string; brand: string; headers: () => HeadersInit; guides: Map<string, Guide> }) {
  const [got, setGot] = useState<Guide | { error: string } | null>(() => guides.get(brand) ?? null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    const failed = (error: string) => live && setGot((g) => (g && !("error" in g) ? g : { error }));
    fetch(`/api/v1/portal/${slug}/brands/${encodeURIComponent(brand)}`, { headers: headers(), cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return failed(body.error?.message ?? "These guidelines didn't load. Try again in a moment.");
        // Before they render: the guidelines build their asset URLs from these.
        addSignatures(body.signed);
        guides.set(brand, body);
        if (live) setGot(body);
      })
      .catch(() => failed("These guidelines didn't load. Check the connection and try again."));
    return () => {
      live = false;
    };
  }, [slug, brand, headers, guides, attempt]);
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-8">
      {!got ? (
        <div role="status" aria-label="Loading the guidelines" className="space-y-8">
          <Skeleton className="h-9 w-64" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="aspect-[4/3] rounded-lg" />
            ))}
          </div>
          <div className="space-y-2">
            {[92, 78, 85, 60].map((w) => (
              <Skeleton key={w} className="h-4" style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>
      ) : "error" in got ? (
        <div className="py-16 text-center">
          <p className="text-muted-foreground text-sm">{got.error}</p>
          <Button variant="outline" className="mt-4" onClick={() => (setGot(null), setAttempt((n) => n + 1))}>
            <IconRefresh /> Try again
          </Button>
        </div>
      ) : (
        <Guidelines name={got.brand.name} rules={got.data} />
      )}
    </main>
  );
}

/**
 * The page in the portal's accent. Inline, so the server's first paint has
 * it; useAccent too, since menus and dialogs render outside this wrapper.
 */
function Shell({ theme, children }: { theme: Theme | null; children: React.ReactNode }) {
  const accent = theme?.accent;
  useAccent(accent);
  const vars = accent ? ({ "--primary": accent, "--primary-foreground": inkOn(accent), "--ring": accent } as React.CSSProperties) : undefined;
  return (
    <div className="min-h-svh" style={vars}>
      {children}
    </div>
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

/** Not in yet: a password, a sign-in, and for either, a way to ask. */
function Gate({ slug, state, ownDomain, onPassword }: { slug: string; state: Gated; ownDomain: boolean; onPassword: (p: string) => Promise<unknown> }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [asking, setAsking] = useState(false);
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Signed in here, but not one of the team: signing in again won't help. */
  const [who, setWho] = useState<string | null>(null);
  const members = state.access === "members";
  useEffect(() => {
    if (!members || ownDomain) return;
    let live = true;
    fetch("/api/v1/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => live && setWho(b?.data?.user?.email ?? null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [members, ownDomain]);
  useEffect(() => {
    // After a wrong one, the whole password is selected, ready to retype.
    if (state.wrong) input.current?.select();
  }, [state]);

  const problem = state.note ?? (state.wrong ? "That password isn't right." : null);
  // Where signing in can't let them in, asking is the way.
  const askFirst = members && (ownDomain || !!who);
  const lead = asked
    ? "Thanks: you'll hear back by email. Nothing more to do here for now."
    : !members
      ? "This portal asks for a password. No password? Ask for access."
      : who
        ? `Signed in as ${who}, which isn't on this team. Ask for access, and they'll answer by email.`
        : ownDomain
          ? "This portal is for the team behind it. Ask for access, and they'll answer by email."
          : "This portal is for the team behind it. Sign in if you are one of them, or ask for access.";

  return (
    <main
      className={cn("flex min-h-svh items-center justify-center p-4", !state.theme.background && "bg-muted/40")}
      style={state.theme.background ? { background: state.theme.background } : undefined}
    >
      <div className="bg-background w-full max-w-sm space-y-6 rounded-xl border p-6 shadow-sm sm:p-8">
        <div className="space-y-3">
          {state.theme.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={state.theme.logo} alt="" className="h-8 w-auto max-w-[200px] object-contain object-left" />
          )}
          <h1 className="text-xl font-semibold tracking-tight">{state.name}</h1>
          <p className="text-muted-foreground flex gap-2 text-sm text-pretty" role={asked ? "status" : undefined}>
            {asked && <IconCircleCheck className="text-success mt-px size-4 shrink-0" />}
            {lead}
          </p>
        </div>
        {!asked && !asking && !members && (
          <form
            className="grid gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              await onPassword(String(new FormData(e.currentTarget).get("password") ?? ""));
              setBusy(false);
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor={id}>Password</Label>
              <PasswordInput
                ref={input}
                id={id}
                name="password"
                required
                autoFocus
                autoComplete="current-password"
                aria-invalid={!!problem || undefined}
                aria-describedby={problem ? `${id}-err` : undefined}
              />
              {problem && (
                <p id={`${id}-err`} role="alert" className="text-destructive text-sm">
                  {problem}
                </p>
              )}
            </div>
            <Button type="submit" pending={busy}>
              <IconLock /> Open
            </Button>
          </form>
        )}
        {!asked && !asking && members && !askFirst && (
          <Button asChild className="w-full">
            <a href={`/login?next=${encodeURIComponent(`/p/${slug}`)}`}>Sign in</a>
          </Button>
        )}
        {!asked && !asking && (
          <Button variant={askFirst ? "default" : "outline"} className="w-full" onClick={() => setAsking(true)}>
            Ask for access
          </Button>
        )}
        {asking && !asked && (
          <form
            className="grid gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              const f = new FormData(e.currentTarget);
              setBusy(true);
              setError(null);
              try {
                const res = await fetch(`/api/v1/portal/${slug}/requests`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email: f.get("email"), name: f.get("name") || undefined, note: f.get("note") || undefined }),
                });
                if (res.ok) return setAsked(true);
                setError((await res.json().catch(() => null))?.error?.message ?? "That didn't go through. Try again.");
              } catch {
                setError("Couldn't reach the server. Check the connection and try again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor={`${id}-email`}>Email</Label>
              <Input
                id={`${id}-email`}
                name="email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                defaultValue={who ?? undefined}
                aria-describedby={error ? `${id}-ask-err` : undefined}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${id}-name`}>Name</Label>
              <Input id={`${id}-name`} name="name" maxLength={120} autoComplete="name" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${id}-note`}>Who you are, and what it&apos;s for</Label>
              <Textarea id={`${id}-note`} name="note" maxLength={2000} rows={3} />
            </div>
            {error && (
              <p id={`${id}-ask-err`} role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => (setAsking(false), setError(null))}>
                Back
              </Button>
              <Button type="submit" pending={busy} className="flex-1">
                <IconSend /> Send
              </Button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
