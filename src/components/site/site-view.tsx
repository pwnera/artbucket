"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { IconLock, IconMenu2, IconPrinter, IconSearch, IconSend } from "@tabler/icons-react";
import { PageBody } from "@/components/brand-sections";
import { LABEL, LookProvider, useSiteLook } from "@/components/brand-sections/look";
import { goTo, TYPING, useHashFlash } from "@/components/site/anchors";
import { SiteFooter } from "@/components/site/footer";
import { NavBar, NavTree, plain } from "@/components/site/nav-tree";
import { PageHeader } from "@/components/site/page-header";
import { Pager } from "@/components/site/pager";
import { QuickGrab } from "@/components/site/quick-grab";
import { SiteSearch } from "@/components/site/search";
import { type Site, SiteProvider, useSite } from "@/components/site/site-context";
import { LanguageSwitch } from "@/components/site/language";
import { hashId, OpenTabProvider } from "@/components/site/tabs";
import { TermsGate } from "@/components/site/terms";
import { OnThisPage } from "@/components/site/toc";
import { WhatsNew } from "@/components/site/updates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { Audience } from "@/lib/pages";
import type { PortalSite } from "@/lib/portal";
import { depthFirst, neighbors, type NavNode, order, trail, tree } from "@/lib/site";
import type { PageView } from "@/lib/site";
import { cn } from "@/lib/utils";

/** A portal's part of GET /portal/{slug}/site (its `portal`), as the site around its pages reads it. */
export type SitePortal = {
  slug: string;
  site: PortalSite;
  brands: { slug: string; name: string; publishedAt: string | null }[];
  /** Who the visitor is to it: what they may read. */
  level: Audience;
  /** The footer says "Made with Artbucket": no white-label on its organization's plan. */
  madeWith?: boolean;
};

export type SiteViewProps = {
  view: PageView;
  href: Site["href"];
  url?: Site["url"];
  /** Where sticky chrome sits: under the app's header, or at the top of a portal. */
  top?: "top-0" | "top-14";
  header?: React.ReactNode;
  /** A plain click on a link inside the site; modifier clicks keep the browser's way. */
  onNavigate?: (href: string) => void;
  mode?: "read" | "edit";
  /** On a portal: search asks it, and quick grab, the footer, the terms and a locked page's way in come with it. */
  portal?: SitePortal;
  /** Where the portal's links start: "" on its own domain; /p/{slug} when left out. */
  base?: string;
  /** The site response's `canonical`: which page a locked view stands for. */
  canonical?: string | null;
  /** The headers the visitor got in with (X-Portal-Password, X-Portal-Key), for search and What's new. Keep it stable. */
  headers?: () => HeadersInit;
  /** What's new (?view=updates) in place of the page. */
  whatsNew?: boolean;
};

/** Sticky chrome under whatever the host pins above it, and anchors that land clear of both. */
const PIN = {
  "top-0": { top: "top-0", tall: "max-h-svh", land: "[&_[id]]:scroll-mt-16" },
  "top-14": { top: "top-14", tall: "max-h-[calc(100svh-3.5rem)]", land: "[&_[id]]:scroll-mt-28" },
} as const;

/** The grid at 72rem and up: the nav's column, the page, on-this-page's column. */
const GRID = {
  both: "@6xl/site:grid-cols-[16rem_minmax(0,1fr)_14rem]",
  nav: "@6xl/site:grid-cols-[16rem_minmax(0,1fr)]",
  toc: "@6xl/site:grid-cols-[minmax(0,1fr)_14rem]",
};

/**
 * A brand's site around one page: the pages on the start side, the page in
 * the middle, on-this-page on the end side, from a 72rem container up. Below
 * that the pages open in a sheet from a bar that stays in view, and
 * on-this-page folds under the header. A theme's `nav` moves the pages into
 * that bar: `top` lists the top pages along it, `overlay` keeps them in the
 * sheet at every width. Its `toc` places on-this-page: `side` as above,
 * `inline` folded under the header at every width, `none` not at all. A
 * `landing` page spans the site: no nav column, on-this-page or pager, and
 * the menu button at every width. The host supplies the <main> (the app's
 * inset, a portal's page), so none is drawn here; chrome carries data-chrome
 * and hides in print.
 */
export function SiteView({ view, href, url, mode, ...p }: SiteViewProps) {
  return (
    <SiteProvider view={view} href={href} url={url} mode={mode} portal={p.portal?.slug} headers={p.headers}>
      <LookProvider>
        <Layout {...p} />
      </LookProvider>
    </SiteProvider>
  );
}

function Layout({
  top = "top-0",
  header,
  onNavigate,
  portal,
  base = portal ? `/p/${portal.slug}` : "",
  canonical,
  headers,
  whatsNew,
}: Omit<SiteViewProps, "view" | "href" | "url" | "mode">) {
  const { view, href, idOf, context, mode } = useSite();
  const page = whatsNew ? null : view.page;
  const current = page?.slug ?? null;
  const pin = PIN[top];
  const look = useSiteLook();
  const nav = view.theme.nav;
  const side = nav === "sidebar";
  const landing = page?.layout === "landing";
  // The nav's own column, at 72rem and up; a landing page gives it to the page.
  const column = side && !landing;
  const toc = landing || whatsNew ? "none" : view.theme.toc;
  const roots = useMemo(() => tree(view.nav, view.theme.numbering), [view.nav, view.theme.numbering]);
  const path = useMemo(() => (current ? trail(roots, current) : []), [roots, current]);
  // As PageBody draws them: those for another context left out.
  const sections = useMemo(
    () => page?.sections.filter((s) => !s.only || (s.only === "default" ? null : s.only) === context) ?? [],
    [page, context],
  );
  const listed = toc !== "none" && sections.filter((s) => s.title).length > 1;
  const grid = column ? (toc === "side" ? GRID.both : GRID.nav) : toc === "side" ? GRID.toc : undefined;

  const [menu, setMenu] = useState(false);
  const [searching, setSearching] = useState(false);
  const go = useCallback((to: string) => (onNavigate ? onNavigate(to) : window.location.assign(to)), [onNavigate]);
  const first = portal?.brands[0]?.slug;
  // Search and quick grab: in the bar, or atop the nav's column where it stands.
  const tools = (wide: boolean) => (
    <>
      <Button
        variant={wide ? "outline" : "ghost"}
        size="sm"
        aria-keyshortcuts="/"
        onClick={() => setSearching(true)}
        className={cn(wide && "text-muted-foreground w-full justify-start")}
      >
        <IconSearch aria-hidden />
        <span className={cn(!wide && "sr-only @md/site:not-sr-only")}>Search</span>
        <Kbd keys={["/"]} className={cn(wide ? "ms-auto" : "hidden @md/site:inline-flex")} />
      </Button>
      {!!portal?.site.quick?.length && first && (
        <QuickGrab quick={portal.site.quick} base={base} first={first} onNavigate={onNavigate} className={cn(wide && "w-full justify-start")} />
      )}
      <LanguageSwitch view={view} onNavigate={onNavigate} className={cn(wide && "w-full")} />
      <Button variant="ghost" size="sm" onClick={() => window.print()} className={cn(wide && "text-muted-foreground w-full justify-start")}>
        <IconPrinter aria-hidden />
        <span className={cn(!wide && "sr-only")}>Print this page</span>
      </Button>
    </>
  );
  // Left for a page: focus goes to that page (below), not back to the menu button.
  const left = useRef(false);
  const fromMenu = useCallback(
    (to: string) => {
      left.current = true;
      setMenu(false);
      go(to);
    },
    [go],
  );

  const article = useRef<HTMLElement>(null);
  const head = useRef<HTMLDivElement>(null);
  useHashFlash();

  // Another page: to its anchor, else its top, and the reader's focus to it, as a page load would.
  const shown = useRef(current);
  useEffect(() => {
    if (shown.current === current) return;
    shown.current = current;
    const id = hashId();
    const at = id ? document.getElementById(id) : null;
    if (at) at.scrollIntoView();
    else window.scrollTo(0, 0);
    article.current?.focus({ preventScroll: true });
  }, [current]);

  // The running head shows once the page's own header has scrolled away under the sticky chrome.
  const [past, setPast] = useState(false);
  useEffect(() => {
    const el = head.current;
    if (!el) return setPast(false);
    const io = new IntersectionObserver(([e]) => setPast(!e.isIntersecting && e.boundingClientRect.top < 0), {
      rootMargin: top === "top-14" ? "-56px 0px 0px 0px" : "0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [top, current]);

  // J and K between the sections that show, [ and ] between pages; never while typing or in a dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof Element && e.target.closest(TYPING)) return;
      const key = e.key.toLowerCase();
      if (key === "j" || key === "k") {
        const all = [...(article.current?.querySelectorAll<HTMLElement>("section[data-template]") ?? [])].filter((el) => el.getClientRects().length);
        // The one being read: the last whose top has passed 30% of the window, as on-this-page reads it.
        const at = all.filter((el) => el.getBoundingClientRect().top < innerHeight * 0.3).length - 1;
        const to = all[key === "j" ? at + 1 : Math.max(at - 1, 0)];
        if (!to) return;
        goTo(to.id);
      } else if (key === "[" || key === "]") {
        const to = current && neighbors(roots, current)[key === "[" ? "prev" : "next"];
        if (!to) return;
        go(href(to.slug));
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [roots, current, go, href]);

  // Links drawn inside sections (prose, page cards) move within the site like the chrome's own.
  const onClick = (e: React.MouseEvent) => {
    if (mode !== "read" || !onNavigate || e.defaultPrevented || !plain(e)) return;
    const a = (e.target as Element).closest?.("a[href]");
    if (!(a instanceof HTMLAnchorElement) || !article.current?.contains(a) || a.target || a.hasAttribute("download") || a.getAttribute("href")!.startsWith("#")) return;
    if (a.origin !== location.origin) return;
    e.preventDefault();
    onNavigate(a.href);
  };

  return (
    <div className="@container/site relative" onClick={onClick}>
      <a
        href={`#${idOf("content")}`}
        onClick={(e) => {
          // To the page with no anchor in the address, which would light the whole page up (useHashFlash).
          e.preventDefault();
          article.current?.focus({ preventScroll: true });
          article.current?.scrollIntoView();
        }}
        data-chrome
        className="bg-background focus-visible:ring-ring/50 sr-only z-50 rounded-md px-3 py-2 text-sm font-medium shadow-md outline-none focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus-visible:ring-2 print:hidden"
      >
        Skip to content
      </a>
      {header}
      <OpenTabProvider page={current}>
        {/* Faces for the reader's script (look.tsx), escaped like SiteProvider's. */}
        {look.faces && <style>{look.faces}</style>}
        <div
          style={look.style}
          lang={look.lang}
          dir={look.dir}
          data-motion={view.theme.motion}
          className={cn(look.className, pin.land, "@6xl/site:grid", grid)}
        >
          {column && (
            <aside data-chrome className={cn("sticky hidden self-start overflow-y-auto border-e p-3 @6xl/site:block print:hidden", pin.top, pin.tall)}>
              <div className="mb-3 grid gap-1">{tools(true)}</div>
              <NavTree roots={roots} current={current} onNavigate={onNavigate} />
            </aside>
          )}

          <div className="min-w-0">
            <div
              data-chrome
              className={cn(
                "bg-background/90 supports-[backdrop-filter]:bg-background/75 sticky z-10 flex h-11 items-center gap-2 border-b px-3 backdrop-blur print:hidden",
                pin.top,
                // Beside a sidebar it only carries the running head, so it stays out of the way until that shows.
                column && "@6xl/site:-mb-11",
                column && !past && "@6xl/site:invisible",
              )}
            >
              <Sheet open={menu} onOpenChange={setMenu}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="sm" className={cn(column && "@6xl/site:hidden")}>
                    <IconMenu2 aria-hidden />
                    Pages
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  // It portals out of the site, so it takes the site's look along; bg-background is the brand's surface there.
                  style={look.style}
                  lang={look.lang}
                  dir={look.dir}
                  className={cn(look.className, "bg-background text-foreground overflow-y-auto p-3 pt-12")}
                  onCloseAutoFocus={(e) => {
                    if (left.current) e.preventDefault();
                    left.current = false;
                  }}
                >
                  <SheetTitle className="sr-only">{view.brand.name} pages</SheetTitle>
                  <NavTree roots={roots} current={current} onNavigate={fromMenu} />
                </SheetContent>
              </Sheet>
              {nav === "top" && (
                <div className="hidden min-w-0 flex-1 @6xl/site:block">
                  <NavBar roots={roots} current={current} onNavigate={onNavigate} />
                </div>
              )}
              {/* The chapter and the page, once the page's own header is out of view. */}
              <p aria-hidden className={cn("text-muted-foreground min-w-0 truncate text-sm", !past && "invisible", nav === "top" && "@6xl/site:hidden")}>
                {path.length > 1 && <span>{path[0].title} / </span>}
                <span className="text-foreground font-medium">{whatsNew ? "What's new" : (path.at(-1)?.title ?? page?.title)}</span>
              </p>
              <div className={cn("ms-auto flex shrink-0 items-center gap-1", column && "@6xl/site:hidden")}>{tools(false)}</div>
            </div>

            <article ref={article} id={idOf("content")} tabIndex={-1} className="@container outline-none">
              {whatsNew ? (
                <WhatsNew portal={portal?.slug} headers={headers} />
              ) : page ? (
                <>
                  <div ref={head}>
                    <PageHeader page={page} roots={roots} onNavigate={onNavigate} />
                  </div>
                  {listed && (
                    <details data-chrome className={cn("mx-6 my-4 rounded-lg border @3xl:mx-10 print:hidden", toc === "side" && "@6xl/site:hidden")}>
                      <summary className={cn(LABEL, "text-muted-foreground cursor-pointer px-3 py-2")}>On this page</summary>
                      <div className="px-1 pb-2">
                        <OnThisPage sections={sections} />
                      </div>
                    </details>
                  )}
                  <PageBody page={page} />
                  {!landing && <Pager roots={roots} current={page.slug} onNavigate={onNavigate} />}
                </>
              ) : view.locked && portal ? (
                <Locked portal={portal} base={base} canonical={canonical} roots={roots} />
              ) : (
                <div className="mx-auto max-w-(--brand-measure) space-y-2 px-6 py-16">
                  <h1 className="text-2xl font-semibold">{view.locked ? "This page is locked" : "Nothing here yet"}</h1>
                  <p className="text-muted-foreground">
                    {view.locked ? "It's for readers with more access than this link gives." : "This brand has no pages to show."}
                  </p>
                </div>
              )}
            </article>
          </div>

          {listed && toc === "side" && (
            <aside data-chrome className={cn("sticky hidden self-start overflow-y-auto p-3 pt-8 @6xl/site:block print:hidden", pin.top, pin.tall)}>
              <p className={cn(LABEL, "text-muted-foreground px-3 pb-2")}>On this page</p>
              <OnThisPage sections={sections} />
            </aside>
          )}
          {portal && <SiteFooter portal={portal} base={base} onNavigate={onNavigate} />}
        </div>
      </OpenTabProvider>
      <SiteSearch open={searching} onOpenChange={setSearching} go={go} portal={portal} base={base} headers={headers} />
      {portal?.site.terms && <TermsGate portal={portal.slug} terms={portal.site.terms} />}
    </div>
  );
}

/**
 * A page above the visitor's level: who it's for, and their way in. A
 * members page asks them to sign in (never on the portal's own domain, where
 * the app's session can't reach); anything else, or there, to ask for
 * access, which the portal's admins answer by email.
 */
function Locked({ portal, base, canonical, roots }: { portal: SitePortal; base: string; canonical?: string | null; roots: NavNode[] }) {
  const { view } = useSite();
  // The page a portal path names: the first brand's at the top, the others' under their slug; none, the first locked.
  const at = (canonical ?? "").split("/").filter(Boolean)[view.brand.slug === portal.brands[0]?.slug ? 0 : 1];
  const target = depthFirst(roots).find((n) => n.slug === at) ?? order(roots).find((n) => n.locked);
  const members = target?.audience === "members";
  const signIn = members && base !== "";
  return (
    <div className="mx-auto max-w-(--brand-measure) space-y-4 px-6 py-16">
      <h1 className="flex items-center gap-2 text-2xl font-semibold">
        <IconLock aria-hidden className="text-muted-foreground size-6" />
        {target?.title ?? "This page is locked"}
      </h1>
      <p className="text-muted-foreground text-pretty">
        {members
          ? `It's for the team behind ${view.brand.name}${portal.level === "partners" ? ", beyond what your link opens" : ""}. ${signIn ? "Sign in if you are one of them." : "Ask for access, and they'll answer by email."}`
          : "It's for partners. Ask for access, and the team will answer by email."}
      </p>
      {signIn ? (
        <Button asChild>
          <a href={`/login?next=${encodeURIComponent(`${base}${canonical ?? ""}`)}`}>Sign in</a>
        </Button>
      ) : (
        <AskForAccess slug={portal.slug} />
      )}
    </div>
  );
}

function AskForAccess({ slug }: { slug: string }) {
  const id = useId();
  const [at, setAt] = useState<"closed" | "open" | "busy" | "sent">("closed");
  const [error, setError] = useState<string | null>(null);
  if (at === "sent") return <p role="status">Thanks: you&apos;ll hear back by email.</p>;
  if (at === "closed") return <Button onClick={() => setAt("open")}>Ask for access</Button>;
  return (
    <form
      className="grid max-w-sm gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (at === "busy") return;
        const f = new FormData(e.currentTarget);
        setAt("busy");
        setError(null);
        try {
          const res = await fetch(`/api/v1/portal/${slug}/requests`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: f.get("email"), note: f.get("note") || undefined }),
          });
          if (res.ok) return setAt("sent");
          setError((await res.json().catch(() => null))?.error?.message ?? "That didn't go through. Try again.");
        } catch {
          setError("Couldn't reach the server. Check the connection and try again.");
        }
        setAt("open");
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
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${id}-err` : undefined}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-note`}>Who you are, and what it&apos;s for</Label>
        <Textarea id={`${id}-note`} name="note" maxLength={2000} rows={3} />
      </div>
      {error && (
        <p id={`${id}-err`} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button type="submit" pending={at === "busy"}>
        <IconSend aria-hidden /> Send
      </Button>
    </form>
  );
}
