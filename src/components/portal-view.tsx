"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { IconCircleCheck, IconLock, IconRefresh, IconSend } from "@/components/icons";
import { ThemeToggle, useAccent } from "@/components/brand";
import { FloatingEdit } from "@/components/floating-edit";
import { type Access, type AssetsView, PortalAssets, type PortalBody, type Theme } from "@/components/portal-assets";
import { AskNotice, PrivacyLink } from "@/components/site/footer";
import { SiteLink } from "@/components/site/nav-tree";
import { Book } from "@/components/site/book";
import { SiteView } from "@/components/site/site-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { inkOn } from "@/lib/color";
import type { Audience } from "@/lib/pages";
import type { PortalSite } from "@/lib/portal";
import { builderPath, canonicalPath, type PageView } from "@/lib/site";
import { cn } from "@/lib/utils";
import { shake } from "@/lib/motion";

export type { PortalBody } from "@/components/portal-assets";

/** GET /api/v1/portal/{slug}/site's `data`: a page of the portal's brand book, as this visitor may read it. */
type SiteData = {
  portal: {
    slug: string;
    name: string;
    theme: Theme;
    site: PortalSite;
    brands: { slug: string; name: string; publishedAt: string | null }[];
    /** It shows collections: an Assets view (?view=assets). */
    assets: boolean;
    level: Audience;
    madeWith?: boolean;
  };
  canonical: string | null;
  redirect: boolean;
  view: PageView | null;
};
type Err = PortalBody["error"];
/** GET /api/v1/portal/{slug}/site's body, whatever its status. */
export type SiteBody = { data?: SiteData; error?: Err };

/**
 * What a load brought: a page of the site, with the context and language
 * asked for (`query`, which its links keep), or the Assets view, with its
 * search. The page's server render passes the first one.
 */
export type Loaded = { site: SiteBody; query: string } | { assets: PortalBody; q: string; collection: string | null; asset: string | null };

type Gated = { at: "gate"; name: string; access: Access; theme: Theme; wrong: boolean; note?: string };
type Opened = { at: "site"; data: SiteData & { view: PageView }; query: string } | { at: "assets"; view: AssetsView; q: string; collection: string | null; asset: string | null };
type State = { at: "loading" } | { at: "error"; title: string; message: string; retry?: boolean } | Gated | Opened;
type Pass = { password?: string; key?: string };

const NO_THEME: Theme = { logo: null, accent: null, background: null };
const isOpen = (s: State): s is Opened => s.at === "site" || s.at === "assets";

/** A path on the portal (`/`, `/logo`) at its link base: /p/{slug}, or nothing on its own domain. */
const at = (base: string, path: string) => base + (path === "/" ? "" : path) || "/";

/** The portal path an address names, `logo` or `brand/logo`; null outside the portal (the app, an asset's bytes). */
function pathIn(base: string, pathname: string) {
  if (/^\/(a|api)\//.test(pathname)) return null;
  if (pathname === (base || "/")) return "";
  return pathname.startsWith(`${base}/`) ? pathname.slice(base.length + 1).replace(/\/$/, "") : null;
}

/** The Assets view (D16): asked for, or an old link's search, collection or asset with no page named. */
const wantsAssets = (sp: URLSearchParams, path: string) => sp.get("view") === "assets" || (!path && ["collection", "q", "asset"].some((k) => sp.has(k)));

/** The part of the query every link on the site keeps: the context and language being read. */
function keep(sp: URLSearchParams) {
  const q = new URLSearchParams();
  for (const k of ["context", "lang"]) if (sp.get(k)) q.set(k, sp.get(k)!);
  // What's new and the whole book are views of the same site; links from them lead back to pages.
  const view = sp.get("view");
  if (view === "updates" || view === "book") q.set("view", view);
  return q;
}

/** "Logo - Blender": the page and its brand; a locked page, the brand and the portal. */
const titleOf = ({ portal, view }: { portal: { name: string }; view: PageView }) =>
  view.page ? `${view.page.title} - ${view.brand.name}` : `${view.brand.name} - ${portal.name}`;

/**
 * What a response means for the page. `wrong`: a password was just typed, so
 * a refusal says it isn't right. `was` is what showed before, for a refusal
 * that doesn't say whose door it is.
 */
function next(got: Loaded, wrong: boolean, was: State): State {
  if ("site" in got) {
    const d = got.site.data;
    if (d?.view) return { at: "site", data: { ...d, view: d.view }, query: got.query };
  } else if (got.assets.portal) return { at: "assets", view: got.assets as AssetsView, q: got.q, collection: got.collection, asset: got.asset };
  const e = ("site" in got ? got.site.error : got.assets.error) ?? {};
  if (e.code === "password") {
    return { at: "gate", name: e.detail?.name ?? "Portal", access: e.detail?.access ?? "password", theme: e.detail?.theme ?? NO_THEME, wrong };
  }
  if (e.code === "rate_limited" && was.at === "gate") return { ...was, wrong: false, note: e.message };
  if (e.code === "gone") return { at: "error", title: "This portal has closed", message: "Ask whoever sent you here for another way in." };
  if (e.code === "not_found") return { at: "error", title: e.message ?? "There is no portal here", message: "Check the address, or ask whoever sent it." };
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

/**
 * /p/{slug}/{path}, or a portal's own domain: a brand portal, for visitors
 * outside the team. Its pages come from GET /api/v1/portal/{slug}/site, its
 * Assets view from GET /api/v1/portal/{slug}, like any client's; the server
 * renders the first (`initial`), so the portal paints at once in its own
 * look. A plain click on a link within the portal puts the address in
 * history and fetches it here, and Back does the same, so the pass in hand
 * goes along and the door never shows again. A password stays in this tab
 * once it worked; the key from an approved request's link is kept for next time.
 */
export function PortalView({
  slug,
  base,
  path,
  initial,
  ownDomain = false,
  editor,
  privacy = null,
}: {
  slug: string;
  /** Where the portal's paths start: /p/{slug}, or "" on its own domain. */
  base: string;
  /** The portal path first asked for, where signing in comes back to. */
  path: string;
  initial: Loaded | null;
  /** Served at the portal's own domain, where signing in can't work. */
  ownDomain?: boolean;
  /** Whoever is signed in may edit its brands (lib/core/portals.ts portalEditor): their project, and the app's address, for the floating Edit. */
  editor?: { project: string; app: string } | null;
  /** The server's privacy policy (PRIVACY_URL): in the footer, on the door, under a request for access. */
  privacy?: string | null;
}) {
  const [state, setState] = useState<State>(() => (initial ? next(initial, false, { at: "loading" }) : { at: "loading" }));
  const [pending, setPending] = useState(false);
  // A page on its way shows as a thin bar along the top (html[data-loading] in globals.css): a click is never dead.
  useEffect(() => {
    document.documentElement.toggleAttribute("data-loading", pending);
    return () => document.documentElement.removeAttribute("data-loading");
  }, [pending]);
  /** Trying a kept password or key on a door the server showed: a skeleton, not the door. */
  const [checking, setChecking] = useState(false);
  /** Bumped by every load: the Assets view starts again from what it brought. */
  const [loaded, setLoaded] = useState(0);
  const pass = useRef<Pass>({});
  const latest = useRef(state);
  /** The newest load: only it may say what shows. */
  const loads = useRef(0);
  /** The address last loaded, without its anchor: Back to another anchor on it loads nothing. */
  const shown = useRef("");
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

  /** What the address `u` shows: its page of the site, else (a portal with no brand, or ?view=assets) the Assets view. */
  const fetchFor = useCallback(
    async (u: URL): Promise<{ res: Response; got: Loaded }> => {
      const sp = u.searchParams;
      const where = pathIn(base, u.pathname) ?? "";
      const init = { headers: headers(), cache: "no-store" as const };
      if (!wantsAssets(sp, where)) {
        const query = keep(sp);
        const res = await fetch(`/api/v1/portal/${slug}/site?${new URLSearchParams({ path: where, ...Object.fromEntries(query) })}`, init);
        const site = (await res.json().catch(() => ({}))) as SiteBody;
        if (!res.ok || site.data?.view) return { res, got: { site, query: query.size ? `?${query}` : "" } };
      }
      const q = sp.get("q") ?? "";
      const asset = sp.get("asset");
      const assets = (c: string | null) =>
        fetch(`/api/v1/portal/${slug}?${new URLSearchParams({ limit: "60", ...(q && { q }), ...(c && { collection: c }) })}`, init).then(async (res) => ({
          res,
          body: (await res.json().catch(() => ({}))) as PortalBody,
        }));
      // A link to a collection the portal no longer shows opens it unfiltered.
      let collection = sp.get("collection");
      let { res, body } = await assets(collection);
      if (collection && body.error?.code === "not_found") {
        collection = null;
        ({ res, body } = await assets(null));
      }
      return { res, got: { assets: body, q, collection, asset } };
    },
    [slug, base, headers],
  );

  /** A key or password that no longer opens the door is forgotten: wrong, it was never kept; a key lapses. */
  const forget = useCallback(
    (sent: Pass) => {
      if (sent.password) {
        pass.current.password = undefined;
        remember(`${store}:password`, null);
      } else if (sent.key) {
        pass.current.key = undefined;
        remember(`${store}:key`, null);
      }
    },
    [store],
  );

  const load = useCallback(
    async (u: URL, typed = false) => {
      const sent = { ...pass.current };
      const was = latest.current;
      const n = ++loads.current;
      shown.current = u.pathname + u.search;
      setPending(true);
      try {
        const { res, got } = await fetchFor(u);
        if (n !== loads.current) return;
        if (res.ok) {
          if (sent.password) remember(`${store}:password`, sent.password);
          const d = "site" in got ? got.site.data : null;
          // An old slug or a long form: the page, at its address now, with no new history entry.
          if (d?.redirect && d.canonical) {
            history.replaceState(null, "", at(base, d.canonical) + u.search + u.hash);
            shown.current = location.pathname + location.search;
          }
          setLoaded((x) => x + 1);
          return setState(next(got, false, was));
        }
        const code = ("site" in got ? got.site : got.assets).error?.code;
        if (code === "password") forget(sent);
        // Browsing, a passing failure keeps what's on screen.
        if (isOpen(was) && code !== "password" && code !== "gone" && code !== "not_found") {
          toast.error(("site" in got ? got.site : got.assets).error?.message ?? "That didn't load. Try again in a moment.");
          return;
        }
        setState(next(got, typed && !!sent.password, was));
      } catch {
        if (n !== loads.current) return;
        const offline = "Couldn't reach the portal. Check the connection and try again.";
        if (isOpen(was)) toast.error(offline);
        // At the door, the door stays, saying why.
        else if (was.at === "gate") setState({ ...was, wrong: false, note: offline });
        else setState({ at: "error", title: "Couldn't reach the portal", message: "Check the connection and try again.", retry: true });
      } finally {
        if (n === loads.current) setPending(false);
      }
    },
    [fetchFor, forget, base, store],
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
    shown.current = url.pathname + url.search;
    pass.current = { key: link ?? recall(`${store}:key`), password: recall(`${store}:password`) };
    // The server rendered what anyone sees; only a door may open wider for what this browser kept.
    const now = latest.current;
    if (now.at === "loading" || (now.at === "gate" && (pass.current.key || pass.current.password))) {
      setChecking(true);
      void load(url).finally(() => setChecking(false));
    }
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Back and Forward show the address they land on; one that only moves the anchor leaves the page be.
    const onPop = () => {
      if (location.pathname + location.search !== shown.current) void load(new URL(location.href));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [load]);

  /** A plain click on a link: within the portal, the address goes in history and is fetched here; anywhere else, the browser's way. */
  const navigate = useCallback(
    (to: string) => {
      const u = new URL(to, location.href);
      if (u.origin !== location.origin || pathIn(base, u.pathname) === null) return window.location.assign(u);
      // The same page: only the anchor moves, and the browser goes there.
      if (u.pathname + u.search === location.pathname + location.search) return void (location.hash = u.hash);
      history.pushState(null, "", u);
      void load(u);
    },
    [base, load],
  );

  const lost = useCallback(
    (body: PortalBody) => {
      if (body.error?.code === "password") forget({ ...pass.current });
      setState(next({ assets: body, q: "", collection: null, asset: null }, false, latest.current));
    },
    [forget],
  );

  // The tab's title follows the page, as the server's metadata says it (p/[slug]/[[...path]]/page.tsx).
  const title = state.at === "site" ? titleOf(state.data) : null;
  useEffect(() => {
    if (title) document.title = title;
  }, [title]);

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
        <main className="mx-auto max-w-md px-4 py-24 text-center">
          <h1 className="text-xl font-semibold">{state.title}</h1>
          <p className="text-muted-foreground mt-2 text-sm">{state.message}</p>
          {state.retry && (
            <Button variant="outline" className="mt-6" pending={pending} onClick={() => void load(new URL(location.href))}>
              <IconRefresh /> Try again
            </Button>
          )}
        </main>
      </Shell>
    );
  }
  if (state.at === "gate") {
    return (
      <Shell theme={state.theme}>
        <Gate
          slug={slug}
          here={at(`/p/${slug}`, path ? `/${path}` : "/")}
          state={state}
          ownDomain={ownDomain}
          privacy={privacy}
          onPassword={(p) => {
            pass.current.password = p;
            return load(new URL(location.href), true);
          }}
        />
      </Shell>
    );
  }

  if (state.at === "assets") {
    const { portal } = state.view;
    const tabs = portalTabs(portal, base, true);
    return (
      <Shell theme={portal.theme}>
        <PortalAssets
          key={loaded}
          slug={slug}
          base={base}
          initial={state.view}
          q={state.q}
          collection={state.collection}
          asset={state.asset}
          headers={headers}
          onLost={lost}
          onNavigate={navigate}
          privacy={privacy}
          header={
            <PortalHeader name={portal.name} theme={portal.theme} home={at(base, "/")} onNavigate={navigate}>
              {tabs.length > 1 && <PortalNav tabs={tabs} current="" onNavigate={navigate} />}
            </PortalHeader>
          }
        />
      </Shell>
    );
  }

  const { portal, view } = state.data;
  const first = portal.brands[0]?.slug ?? view.brand.slug;
  const brand = view.brand.slug;
  // ?view= says which view shows; it isn't carried on to the pages it links to.
  const params = new URLSearchParams(state.query);
  const mode = params.get("view");
  params.delete("view");
  const query = params.size ? `?${params}` : "";
  const href = (page: string, section?: string) => `${at(base, `/${canonicalPath(first, brand, page).join("/")}`)}${query}${section ? `#${section}` : ""}`;
  /** A page of this brand for the book, through the same door, context and language as the one showing. */
  const loadPage = async (page: string): Promise<PageView> => {
    const path = canonicalPath(first, brand, page).join("/");
    const res = await fetch(`/api/v1/portal/${slug}/site?${new URLSearchParams({ path, ...Object.fromEntries(params) })}`, { headers: headers(), cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as SiteBody;
    if (!res.ok || !body.data?.view) throw new Error(body.error?.message ?? `No page ${page}`);
    return body.data.view;
  };
  const tabs = portalTabs(portal, base, portal.assets);
  // Pages above this visitor show locked; someone of the team can sign in to read them, where signing in works.
  const signIn = !ownDomain && portal.level !== "members" && (view.locked || view.nav.some((p) => p.locked));
  const here = `/p/${slug}${state.data.canonical && state.data.canonical !== "/" ? state.data.canonical : ""}`;
  return (
    <Shell theme={portal.theme}>
      <main>
        {mode === "book" ? (
          <Book view={view} load={loadPage} />
        ) : (
          <SiteView
            view={view}
            href={href}
            onNavigate={navigate}
            portal={portal}
            base={base}
            canonical={state.data.canonical}
            headers={headers}
            whatsNew={mode === "updates"}
            privacy={privacy}
            header={
              <PortalHeader name={portal.name} theme={portal.theme} home={at(base, "/")} onNavigate={navigate}>
                {tabs.length > 1 && <PortalNav tabs={tabs} current={mode === "updates" ? "updates" : brand} onNavigate={navigate} />}
                <div className="ms-auto flex shrink-0 items-center gap-1">
                  {signIn && (
                    <Button variant="ghost" size="sm" asChild>
                      <a href={`/login?next=${encodeURIComponent(here)}`}>Sign in</a>
                    </Button>
                  )}
                </div>
              </PortalHeader>
            }
          />
        )}
      </main>
      {editor && mode !== "book" && (
        <FloatingEdit
          always
          href={editor.app + builderPath(brand, { page: view.page?.slug, context: view.context, project: editor.project })}
        />
      )}
    </Shell>
  );
}

/** The portal's first paint while it opens: shaped like its site (the header, the pages, a page's opening), so nothing jumps when it lands. */
export function PortalSkeleton() {
  return (
    <div role="status" aria-label="Opening the portal" className="@container/site">
      <div className="flex h-12 items-center gap-3 border-b px-4">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div aria-hidden className="@6xl/site:grid @6xl/site:grid-cols-[16rem_minmax(0,1fr)_14rem]">
        <div className="hidden space-y-3 border-e p-5 @6xl/site:block">
          {[70, 55, 80, 60, 45].map((w) => (
            <Skeleton key={w} className="h-4" style={{ inlineSize: `${w}%` }} />
          ))}
        </div>
        <div className="min-w-0">
          <div className="flex h-11 items-center border-b px-3 @6xl/site:hidden">
            <Skeleton className="h-6 w-20" />
          </div>
          <div className="mx-auto max-w-3xl space-y-4 px-6 pt-12 @3xl/site:px-10">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-10 w-72 max-w-full" />
            <Skeleton className="h-5 w-96 max-w-full" />
            <Skeleton className="mt-10 aspect-[16/7] rounded-xl" />
            <div className="space-y-2 pt-6">
              {[92, 78, 85, 60].map((w) => (
                <Skeleton key={w} className="h-4" style={{ inlineSize: `${w}%` }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
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

/** Above the brand's pages, in the portal's own look (3.4 item 11): its logo and name, home, then what the host adds. */
function PortalHeader({
  name,
  theme,
  home,
  onNavigate,
  children,
}: {
  name: string;
  theme: Theme;
  home: string;
  onNavigate: (href: string) => void;
  children: React.ReactNode;
}) {
  const ink = theme.background ? inkOn(theme.background) : undefined;
  return (
    <header
      data-chrome
      // Unset, the band is the accent, faint, as on the Assets view's hero.
      className={cn("border-b print:hidden", !theme.background && "bg-[color-mix(in_oklab,var(--primary)_7%,var(--background))]")}
      style={theme.background ? { background: theme.background, color: ink } : undefined}
    >
      <div className="flex min-h-12 items-center gap-5 px-4">
        <SiteLink href={home} onNavigate={onNavigate} className="flex max-w-[45%] min-w-0 shrink-0 items-center gap-2 text-sm font-semibold">
          {theme.logo && (
            // A rendition already sized for this: next/image would only resize it again.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={theme.logo} alt="" className={cn("h-6 w-auto max-w-28 object-contain", theme.logoDark && "dark:hidden")} />
          )}
          {theme.logo && theme.logoDark && (
            // The brand's logo for dark grounds, in dark mode: the other one would vanish on the dark header.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={theme.logoDark} alt="" className="hidden h-6 w-auto max-w-28 object-contain dark:block" />
          )}
          {/* The logo spells the name already: the words stay for screen readers. */}
          <span className={cn("truncate", theme.logo && theme.logoSays?.trim().toLowerCase() === name.trim().toLowerCase() && "sr-only")}>{name}</span>
        </SiteLink>
        {children}
        {/* On a painted header the toggle keeps the header's ink, hovered or not. */}
        <ThemeToggle className={cn("shrink-0", ink && "hover:bg-current/10 hover:text-current dark:hover:bg-current/10 dark:hover:text-current")} />
      </div>
    </header>
  );
}

type PortalTab = { id: string; name: string; href: string; external?: boolean };

/**
 * What the portal shows, as the prototype's press portal names it: its
 * guidelines (each brand's by its name when it carries several), its Assets
 * view, What's new, and Contact, the footer's feedback address.
 */
function portalTabs(portal: { brands: { slug: string; name: string }[]; site: PortalSite }, base: string, assets: boolean): PortalTab[] {
  const first = portal.brands[0]?.slug;
  const one = portal.brands.length === 1;
  const contact = portal.site.footer?.feedback;
  return [
    ...portal.brands.map((b) => ({ id: b.slug, name: one ? "Guidelines" : b.name, href: at(base, b.slug === first ? "/" : `/${b.slug}`) })),
    ...(assets ? [{ id: "", name: "Assets", href: `${at(base, "/")}?view=assets` }] : []),
    ...(portal.brands.length ? [{ id: "updates", name: "What's new", href: `${at(base, "/")}?view=updates` }] : []),
    ...(contact ? [{ id: "contact", name: "Contact", href: contact, external: true }] : []),
  ];
}

/** The portal's tabs (portalTabs), the one showing marked. */
function PortalNav({ tabs, current, onNavigate }: { tabs: PortalTab[]; current: string; onNavigate: (href: string) => void }) {
  return (
    <nav aria-label="What this portal shows" className="-mb-px flex min-w-0 flex-1 gap-5 overflow-x-auto">
      {tabs.map((t) => (
        <SiteLink
          key={t.id || "assets"}
          href={t.href}
          onNavigate={t.external ? undefined : onNavigate}
          aria-current={current === t.id ? "page" : undefined}
          className={cn(
            "shrink-0 border-b-2 py-3 text-sm transition-colors outline-offset-[-2px]",
            current === t.id ? "border-primary text-foreground font-medium" : "text-muted-foreground hover:text-foreground border-transparent",
          )}
        >
          {t.name}
        </SiteLink>
      ))}
    </nav>
  );
}

/** Not in yet: a password, a sign-in, and for either, a way to ask. */
function Gate({
  slug,
  here,
  state,
  ownDomain,
  privacy,
  onPassword,
}: {
  slug: string;
  /** Where signing in comes back to. */
  here: string;
  state: Gated;
  ownDomain: boolean;
  privacy: string | null;
  onPassword: (p: string) => Promise<unknown>;
}) {
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
    // After a wrong one, the whole password is selected, ready to retype, and the form shakes its head.
    if (state.wrong) {
      input.current?.select();
      shake(input.current?.closest("form"));
    }
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
            <a href={`/login?next=${encodeURIComponent(here)}`}>Sign in</a>
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
            <AskNotice privacy={privacy} />
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
        {privacy && !(asking && !asked) && (
          <p className="text-muted-foreground text-center text-xs">
            <PrivacyLink href={privacy} />
          </p>
        )}
      </div>
    </main>
  );
}
