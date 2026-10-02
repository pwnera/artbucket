"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BrandHeader, type BrandHeaderProps } from "@/components/brand-header";
import { BrandTabMenu } from "@/components/brand-tabs";
import { IconArrowUp, IconPalette, IconPencil } from "@tabler/icons-react";
import { Can } from "@/components/can";
import { IconButton } from "@/components/icon-button";
import { AppHeader } from "@/components/page";
import { useSqueeze } from "@/components/shell";
import { SiteView } from "@/components/site/site-view";
import { ThemePanel } from "@/components/theme-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Status } from "@/components/builder/use-status";
import { behavior } from "@/lib/motion";
import { liveLine } from "@/lib/readiness";
import { contextLabel } from "@/lib/rules";
import { brandPath, builderPath, guidelinesPath, type PageView } from "@/lib/site";
import { cn } from "@/lib/utils";

export type BrandReaderProps = {
  /** The page as the server rendered it (GET /api/v1/brands/{slug}/view); later pages and contexts are fetched. */
  initial: PageView;
  /**
   * Drawn inside the brand's page, its Guidelines tab: `head` is the brand's
   * header (and its tabs) over it, and the app's bar names the brand rather
   * than folding its tabs into a menu. Without it, the reader is in focus
   * mode, /brands/{slug}/guidelines?focus=1.
   */
  embed?: { head: Omit<BrandHeaderProps, "at"> };
  /** Where readers stand (GET .../status), for the label and the switch between the draft and the live release. */
  status: Pick<Status, "publish" | "live"> | null;
  /** What it shows when the address doesn't say (`?version=`): lib/readiness.ts shownVersion. */
  version: "draft" | "live";
};

type At = { context?: string | null; lang?: string | null; version?: string | null };

/** The reader's address for a page of the brand: `/brands/{slug}/guidelines?page=`, with the context, language and version being read, in focus mode or not. */
const readerHref = (brand: string, focus: boolean, page: string | null, o: At = {}) =>
  guidelinesPath(brand, { page, context: o.context, lang: o.lang, version: o.version, focus: focus ? "1" : null });

/** "Logo · Blender guidelines · Print", the page's part of the tab's title, as the server's metadata says it. */
const titleOf = (v: PageView) => `${v.page ? `${v.page.title} · ` : ""}${v.brand.name} guidelines${v.context ? ` · ${contextLabel(v.context)}` : ""}`;

/**
 * A brand's pages as its readers see them, inside the app: the server draws
 * the first from `initial`, and the address says which page and context
 * after that. A click in the site puts the new address in history and its
 * view is fetched; Back does the same. The app's sidebar folds to its rail
 * while it's open, to give the site its three columns. It always says
 * whether it shows the draft or the live release, with a switch while they
 * differ.
 */
export function BrandReader({ initial, embed, status, version: fallback }: BrandReaderProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [theming, setTheming] = useState(false);
  const slug = initial.brand.slug;
  const focus = !embed;
  const at = useCallback((page: string | null, o: At) => readerHref(slug, focus, page, o), [focus, slug]);

  const asked = params.get("version");
  const want = [...["page", "context", "lang"].map((k) => params.get(k) ?? ""), asked ?? fallback].join("\n");
  const [shown, setShown] = useState({ want, view: initial });
  // A new `initial` (router.refresh, a link here from elsewhere in the app) is the server's view of the address now.
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) {
    setSeen(initial);
    setShown({ want, view: initial });
  }
  const view = shown.view;

  useSqueeze();

  useEffect(() => {
    if (want === shown.want) return;
    const [page, context, lang, version] = want.split("\n");
    const q = new URLSearchParams(Object.entries({ page, context, lang, version: version === "live" ? version : "" }).filter(([, v]) => v));
    const ac = new AbortController();
    fetch(`/api/v1/brands/${encodeURIComponent(slug)}/view${q.size ? `?${q}` : ""}`, { signal: ac.signal })
      .then(async (res) => {
        // A page that's gone or a session that lapsed: the server's own render of the address says so.
        if (!res.ok) return window.location.reload();
        const { data } = (await res.json()) as { data: PageView };
        // A slug the page had before a rename: the page, at its address now, with no new history entry.
        if (data.redirect) window.history.replaceState(null, "", at(data.redirect, { context, lang, version: asked }) + location.hash);
        setShown({ want: data.redirect ? [data.redirect, context, lang, version].join("\n") : want, view: data });
      })
      .catch(() => {
        if (!ac.signal.aborted) window.location.reload();
      });
    return () => ac.abort();
  }, [want, shown.want, slug, at, asked]);

  // The tab's title follows the page, keeping the app's name after it.
  const titled = useRef(titleOf(initial));
  useEffect(() => {
    const next = titleOf(view);
    if (document.title.startsWith(titled.current)) document.title = next + document.title.slice(titled.current.length);
    titled.current = next;
  }, [view]);

  const { context, lang } = view;
  const href = useCallback((page: string, section?: string) => at(page, { context, lang, version: asked }) + (section ? `#${section}` : ""), [at, context, lang, asked]);

  // Within the reader, only the view is fetched; anywhere else in the app is the router's.
  const navigate = useCallback(
    (to: string) => {
      const u = new URL(to, location.href);
      if (u.origin !== location.origin) return window.location.assign(to);
      const inside = u.pathname === guidelinesPath(slug) && (u.searchParams.get("focus") === "1") === focus;
      if (!inside) return router.push(to);
      // The same page and context: only the anchor moves, and the browser goes there.
      if (u.search === location.search) return void (location.hash = u.hash);
      window.history.pushState(null, "", u.pathname + u.search + u.hash);
    },
    [router, slug, focus],
  );

  const contexts = view.contexts.length > 0 && (
    <Select value={context ?? "*"} onValueChange={(c) => navigate(at(view.page?.slug ?? null, { context: c === "*" ? null : c, lang, version: asked }))}>
      <SelectTrigger size="sm" aria-label="Read the rules for a context">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="*">Default</SelectItem>
        {view.contexts.map((c) => (
          <SelectItem key={c} value={c}>
            {contextLabel(c)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  const header = embed ? (
    <>
      <AppHeader trail={[{ label: "Brands", href: "/brands" }, { label: view.brand.name, href: brandPath(slug) }, { label: "Guidelines" }]}>
        <Showing view={view} status={status} onPick={(v) => navigate(at(view.page?.slug ?? null, { context, lang, version: v }) + location.hash)} />
        {contexts}
      </AppHeader>
      <BrandHeader {...embed.head} at="guidelines" compact />
    </>
  ) : (
    <AppHeader
      trail={
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <BrandTabMenu brand={view.brand} at="guidelines" />
          <Showing view={view} status={status} onPick={(v) => navigate(at(view.page?.slug ?? null, { context, lang, version: v }) + location.hash)} />
        </div>
      }
    >
      {contexts}
      <Can do="brand.edit">
        <Button variant="outline" size="sm" onClick={() => setTheming(true)}>
          Theme
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={builderPath(slug, { page: view.page?.slug, context })}>Edit</Link>
        </Button>
      </Can>
    </AppHeader>
  );

  return (
    <>
      <SiteView view={view} href={href} top="top-14" header={header} onNavigate={navigate} />
      <Can do="brand.edit">
        <FloatingEdit edit={builderPath(slug, { page: view.page?.slug, context })} onTheme={() => setTheming(true)} />
        {/* A theme save is a draft: the server draws the address again, and the draft with it where it showed the live release. */}
        <ThemePanel slug={slug} theme={view.theme} open={theming} onOpenChange={setTheming} onSaved={() => router.refresh()} />
      </Can>
    </>
  );
}

/**
 * What the reader shows, said: while the draft has changes readers don't
 * see, a switch between the draft and the live release; otherwise the one
 * there is, "@4 live · Up to date" or, before the first release, the draft.
 */
function Showing({ view, status, onPick }: { view: PageView; status: BrandReaderProps["status"]; onPick: (v: "draft" | "live") => void }) {
  if (status?.publish === "behind" && status.live !== null)
    return (
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={view.version ? "live" : "draft"}
        onValueChange={(v) => v && onPick(v as "draft" | "live")}
        aria-label="Show the draft or the live release"
      >
        <ToggleGroupItem value="draft" title="Unreleased changes: readers don't see them yet">
          Draft
        </ToggleGroupItem>
        <ToggleGroupItem value="live">@{status.live} live</ToggleGroupItem>
      </ToggleGroup>
    );
  const text = view.version ? (status ? liveLine(status.publish, view.version.number) : `@${view.version.number} live`) : !status ? "Draft" : status.live === null ? "Draft · Never released" : "Draft · Up to date";
  // The one thing in the bar that may shrink on a phone: it truncates rather than push the page wider.
  return (
    <Badge variant="outline" title={text} className="min-w-0 shrink!">
      <span className="truncate">{text}</span>
    </Badge>
  );
}

/**
 * For an editor, once the header's Edit has scrolled out of reach: Edit this
 * page (the builder, at the page and context being read), the theme, and
 * back to the top, floating at the bottom of the window. Never in print.
 */
function FloatingEdit({ edit, onTheme }: { edit: string; onTheme: () => void }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const on = () => setShown(window.scrollY > 240);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <div
      inert={!shown}
      data-chrome
      className={cn(
        "bg-popover text-popover-foreground fixed end-6 bottom-6 z-30 flex items-center gap-1 rounded-full border p-1 shadow-lg transition-[opacity,translate] duration-200 ease-out motion-reduce:transition-none print:hidden",
        shown ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0",
      )}
    >
      <Button asChild size="sm" className="rounded-full">
        <Link href={edit}>
          <IconPencil aria-hidden /> Edit this page
        </Link>
      </Button>
      <IconButton label="Theme" variant="ghost" className="rounded-full" onClick={onTheme}>
        <IconPalette aria-hidden />
      </IconButton>
      <IconButton label="Back to the top" variant="ghost" className="rounded-full" onClick={() => window.scrollTo({ top: 0, behavior: behavior() })}>
        <IconArrowUp aria-hidden />
      </IconButton>
    </div>
  );
}
