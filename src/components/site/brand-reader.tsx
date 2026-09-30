"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BrandHeader, type BrandHeaderProps } from "@/components/brand-header";
import { BrandTabMenu } from "@/components/brand-tabs";
import { Can } from "@/components/can";
import { AppHeader } from "@/components/page";
import { useSqueeze } from "@/components/shell";
import { SiteView } from "@/components/site/site-view";
import { ThemePanel } from "@/components/theme-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { contextLabel } from "@/lib/rules";
import { brandPath, guidelinesPath, type PageView } from "@/lib/site";

export type BrandReaderProps = {
  /** The page as the server rendered it (GET /api/v1/brands/{slug}/view); later pages and contexts are fetched. */
  initial: PageView;
  /**
   * Drawn inside the brand's page, its Guidelines tab: `path` is its address
   * there (/brands/{slug}/pages), `head` the brand's header (and its tabs)
   * over it, and the app's bar names the brand rather than folding its tabs
   * into a menu. Without it, the reader is /brands/{slug}/guidelines?view=read.
   */
  embed?: { path: string; head: Omit<BrandHeaderProps, "at"> };
};

type At = { context?: string | null; lang?: string | null };

/** The reader's address for a page of the brand: `/brands/{slug}/guidelines?view=read&page=`, with the context and language being read. */
const readerHref = (brand: string, page: string | null, o: At = {}) => guidelinesPath(brand, { view: "read", page, context: o.context, lang: o.lang });

/** The same, embedded at `path`: `?page=`, the context and the language. */
const embedHref = (path: string, page: string | null, o: At = {}) => {
  const q = new URLSearchParams(Object.entries({ page, context: o.context, lang: o.lang }).filter((e): e is [string, string] => !!e[1]));
  return `${path}${q.size ? `?${q}` : ""}`;
};

/** "Logo · Blender guidelines · Print", the page's part of the tab's title, as the server's metadata says it. */
const titleOf = (v: PageView) => `${v.page ? `${v.page.title} · ` : ""}${v.brand.name} guidelines${v.context ? ` · ${contextLabel(v.context)}` : ""}`;

/**
 * A brand's pages as its readers see them, inside the app: the server draws
 * the first from `initial`, and the address says which page and context
 * after that. A click in the site puts the new address in history and its
 * view is fetched; Back does the same. The app's sidebar folds to its rail
 * while it's open, to give the site its three columns.
 */
export function BrandReader({ initial, embed }: BrandReaderProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [theming, setTheming] = useState(false);
  const slug = initial.brand.slug;
  const at = useCallback((page: string | null, o: At) => (embed ? embedHref(embed.path, page, o) : readerHref(slug, page, o)), [embed, slug]);

  // Bumped by a theme save: the same address is fetched again, in its new look.
  const [rev, setRev] = useState(0);
  const want = [...["page", "context", "lang"].map((k) => params.get(k) ?? ""), rev].join("\n");
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
    const [page, context, lang, n] = want.split("\n");
    const q = new URLSearchParams(Object.entries({ page, context, lang }).filter(([, v]) => v));
    const ac = new AbortController();
    fetch(`/api/v1/brands/${encodeURIComponent(slug)}/view${q.size ? `?${q}` : ""}`, { signal: ac.signal })
      .then(async (res) => {
        // A page that's gone or a session that lapsed: the server's own render of the address says so.
        if (!res.ok) return window.location.reload();
        const { data } = (await res.json()) as { data: PageView };
        // A slug the page had before a rename: the page, at its address now, with no new history entry.
        if (data.redirect) window.history.replaceState(null, "", at(data.redirect, { context, lang }) + location.hash);
        setShown({ want: data.redirect ? [data.redirect, context, lang, n].join("\n") : want, view: data });
      })
      .catch(() => {
        if (!ac.signal.aborted) window.location.reload();
      });
    return () => ac.abort();
  }, [want, shown.want, slug, at]);

  // The tab's title follows the page, keeping the app's name after it.
  const titled = useRef(titleOf(initial));
  useEffect(() => {
    const next = titleOf(view);
    if (document.title.startsWith(titled.current)) document.title = next + document.title.slice(titled.current.length);
    titled.current = next;
  }, [view]);

  const { context, lang } = view;
  const href = useCallback((page: string, section?: string) => at(page, { context, lang }) + (section ? `#${section}` : ""), [at, context, lang]);

  // Within the reader, only the view is fetched; anywhere else in the app is the router's.
  const navigate = useCallback(
    (to: string) => {
      const u = new URL(to, location.href);
      if (u.origin !== location.origin) return window.location.assign(to);
      const inside = embed ? u.pathname === embed.path : u.pathname === guidelinesPath(slug) && u.searchParams.get("view") === "read";
      if (!inside) return router.push(to);
      // The same page and context: only the anchor moves, and the browser goes there.
      if (u.search === location.search) return void (location.hash = u.hash);
      window.history.pushState(null, "", u.pathname + u.search + u.hash);
    },
    [router, slug, embed],
  );

  const contexts = view.contexts.length > 0 && (
    <Select value={context ?? "*"} onValueChange={(c) => navigate(at(view.page?.slug ?? null, { context: c === "*" ? null : c, lang }))}>
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
        <Badge variant="outline">{view.version ? `Release @${view.version.number}` : "Draft"}</Badge>
        {contexts}
      </AppHeader>
      <BrandHeader {...embed.head} at="guidelines" />
    </>
  ) : (
    <AppHeader
      trail={
        <p className="flex min-w-0 items-center gap-2 text-sm">
          <BrandTabMenu brand={view.brand} at="guidelines" />
          <Badge variant="outline">{view.version ? `Release @${view.version.number}` : "Draft"}</Badge>
        </p>
      }
    >
      {contexts}
      <Can do="brand.edit">
        <Button variant="outline" size="sm" onClick={() => setTheming(true)}>
          Theme
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={guidelinesPath(slug, { context })}>Edit</Link>
        </Button>
      </Can>
    </AppHeader>
  );

  return (
    <>
      <SiteView view={view} href={href} top="top-14" header={header} onNavigate={navigate} />
      <Can do="brand.edit">
        <ThemePanel slug={slug} theme={view.theme} open={theming} onOpenChange={setTheming} onSaved={() => setRev((r) => r + 1)} />
      </Can>
    </>
  );
}
