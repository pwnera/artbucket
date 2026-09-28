"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconMenu2 } from "@tabler/icons-react";
import { PageBody } from "@/components/brand-sections";
import { LABEL, LOOK } from "@/components/brand-sections/look";
import { useAssetFont } from "@/components/font-preview";
import { goTo, TYPING, useHashFlash } from "@/components/site/anchors";
import { NavTree, plain } from "@/components/site/nav-tree";
import { PageHeader } from "@/components/site/page-header";
import { Pager } from "@/components/site/pager";
import { type Site, SiteProvider, useSite } from "@/components/site/site-context";
import { hashId, OpenTabProvider } from "@/components/site/tabs";
import { OnThisPage } from "@/components/site/toc";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { type BrandTheme, stack } from "@/lib/brand-theme";
import { neighbors, trail, tree } from "@/lib/site";
import type { PageView } from "@/lib/site";
import { cn } from "@/lib/utils";

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
};

/** Sticky chrome under whatever the host pins above it, and anchors that land clear of both. */
const PIN = {
  "top-0": { top: "top-0", tall: "max-h-svh", land: "[&_[id]]:scroll-mt-16" },
  "top-14": { top: "top-14", tall: "max-h-[calc(100svh-3.5rem)]", land: "[&_[id]]:scroll-mt-28" },
} as const;

/**
 * A brand's site around one page: the pages on the start side, the page in
 * the middle, on-this-page on the end side, from a 72rem container up. Below
 * that the pages open in a sheet from a bar that stays in view, and
 * on-this-page folds under the header. The host supplies the <main> (the
 * app's inset, a portal's page), so none is drawn here; chrome carries
 * data-chrome and hides in print.
 */
export function SiteView({ view, href, url, top = "top-0", header, onNavigate, mode }: SiteViewProps) {
  return (
    <SiteProvider view={view} href={href} url={url} mode={mode}>
      <Layout top={top} header={header} onNavigate={onNavigate} />
    </SiteProvider>
  );
}

function Layout({ top, header, onNavigate }: Required<Pick<SiteViewProps, "top">> & Pick<SiteViewProps, "header" | "onNavigate">) {
  const { view, href, idOf, context, mode } = useSite();
  const page = view.page;
  const current = page?.slug ?? null;
  const pin = PIN[top];
  const look = useLook(view.theme.v1);
  const roots = useMemo(() => tree(view.nav, !!view.theme.settings.numbering), [view.nav, view.theme.settings.numbering]);
  const path = useMemo(() => (current ? trail(roots, current) : []), [roots, current]);
  // As PageBody draws them: those for another context left out.
  const sections = useMemo(
    () => page?.sections.filter((s) => !s.only || (s.only === "default" ? null : s.only) === context) ?? [],
    [page, context],
  );
  const listed = sections.filter((s) => s.title).length > 1;

  const [menu, setMenu] = useState(false);
  const go = useCallback((to: string) => (onNavigate ? onNavigate(to) : window.location.assign(to)), [onNavigate]);
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
        <div style={look} className={cn(LOOK, pin.land, "@6xl/site:grid @6xl/site:grid-cols-[16rem_minmax(0,1fr)_14rem]")}>
          <aside data-chrome className={cn("sticky hidden self-start overflow-y-auto border-e p-3 @6xl/site:block print:hidden", pin.top, pin.tall)}>
            <NavTree roots={roots} current={current} onNavigate={onNavigate} />
          </aside>

          <div className="min-w-0">
            <div
              data-chrome
              className={cn(
                "bg-background/90 supports-[backdrop-filter]:bg-background/75 sticky z-10 flex h-11 items-center gap-2 border-b px-3 backdrop-blur @6xl/site:-mb-11 print:hidden",
                pin.top,
                !past && "@6xl/site:invisible",
              )}
            >
              <Sheet open={menu} onOpenChange={setMenu}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="sm" className="@6xl/site:hidden">
                    <IconMenu2 aria-hidden />
                    Pages
                  </Button>
                </SheetTrigger>
                <SheetContent
                side="left"
                className="overflow-y-auto p-3 pt-12"
                onCloseAutoFocus={(e) => {
                  if (left.current) e.preventDefault();
                  left.current = false;
                }}
              >
                  <SheetTitle className="sr-only">{view.brand.name} pages</SheetTitle>
                  <NavTree roots={roots} current={current} onNavigate={fromMenu} />
                </SheetContent>
              </Sheet>
              {/* The chapter and the page, once the page's own header is out of view. */}
              <p aria-hidden className={cn("text-muted-foreground min-w-0 truncate text-sm", !past && "invisible")}>
                {path.length > 1 && <span>{path[0].title} / </span>}
                <span className="text-foreground font-medium">{path.at(-1)?.title ?? page?.title}</span>
              </p>
            </div>

            <article ref={article} id={idOf("content")} tabIndex={-1} className="@container outline-none">
              {page ? (
                <>
                  <div ref={head}>
                    <PageHeader page={page} roots={roots} onNavigate={onNavigate} />
                  </div>
                  {listed && (
                    <details data-chrome className="mx-6 my-4 rounded-lg border @3xl:mx-10 @6xl/site:hidden print:hidden">
                      <summary className={cn(LABEL, "text-muted-foreground cursor-pointer px-3 py-2")}>On this page</summary>
                      <div className="px-1 pb-2">
                        <OnThisPage sections={sections} />
                      </div>
                    </details>
                  )}
                  <PageBody page={page} />
                  <Pager roots={roots} current={page.slug} onNavigate={onNavigate} />
                </>
              ) : (
                <div className="mx-auto max-w-[var(--brand-measure,42rem)] space-y-2 px-6 py-16">
                  <h1 className="text-2xl font-semibold">{view.locked ? "This page is locked" : "Nothing here yet"}</h1>
                  <p className="text-muted-foreground">
                    {view.locked ? "It's for readers with more access than this link gives." : "This brand has no pages to show."}
                  </p>
                </div>
              )}
            </article>
          </div>

          {listed && (
            <aside data-chrome className={cn("sticky hidden self-start overflow-y-auto p-3 pt-8 @6xl/site:block print:hidden", pin.top, pin.tall)}>
              <p className={cn(LABEL, "text-muted-foreground px-3 pb-2")}>On this page</p>
              <OnThisPage sections={sections} />
            </aside>
          )}
        </div>
      </OpenTabProvider>
    </div>
  );
}

/** The brand's faces and accent as the page's variables (look.tsx); the theme's own variables replace these in W3. */
function useLook(t: BrandTheme): React.CSSProperties {
  const head = useAssetFont(t.head?.file);
  const body = useAssetFont(t.body?.file);
  return {
    ...(t.head && { "--brand-head": stack(t.head, head), "--brand-head-weight": String(t.head.weight ?? 600) }),
    ...(t.body && { "--brand-body": stack(t.body, body) }),
    ...(t.accent && { "--brand-accent-l": t.accent.light, "--brand-accent-d": t.accent.dark }),
  } as React.CSSProperties;
}
