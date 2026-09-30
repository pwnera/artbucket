"use client";

import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { IconPrinter } from "@tabler/icons-react";
import { PageBody } from "@/components/brand-sections";
import { HEAD, LABEL, useSiteLook } from "@/components/brand-sections/look";
import { LocalDate } from "@/components/public-grid";
import { PageHeader } from "@/components/site/page-header";
import { type Site, SiteProvider, useSite } from "@/components/site/site-context";
import { Button } from "@/components/ui/button";
import { pool } from "@/lib/pool";
import { type NavNode, type PageView, tree } from "@/lib/site";
import { cn } from "@/lib/utils";

export type BookProps = {
  /** A page's view as the host read it (a portal's GET site, the app's GET view): its nav lists the pages, its theme dresses the book. */
  view: PageView;
  /** Another page's view, read the way `view` was (the same pass, context and language). */
  load: (page: string) => Promise<PageView>;
  /** Left out, asset URLs are signed from each page's view. */
  url?: Site["url"];
};

/** The prefix a page's ids take in the book, so no two pages' sections clash. */
const prefix = (page: string) => `${page}--`;

/** Links inside the book go to its chapters. */
const href = (page: string, section?: string) => `#${section ? prefix(page) + section : page}`;

/** Every page with its depth, a tabs page's tabs too, in reading order. */
const flat = (ns: NavNode[], depth = 0): { node: NavNode; depth: number }[] =>
  ns.flatMap((node) => [{ node, depth }, ...flat(node.children, depth + 1)]);

/**
 * The whole brand as one document to print (`?view=book`, build spec 3.4
 * item 9): its name and contents, then every page this reader may open, each
 * from its own view, drawn by the renderers the site uses and opening on a
 * new sheet. The host supplies the <main>. Pages load four at a time;
 * printing waits for the last.
 */
export function Book({ view, load, url }: BookProps) {
  return (
    <SiteProvider view={view} href={href} url={url}>
      <Pages load={load} url={url} />
    </SiteProvider>
  );
}

function Pages({ load, url }: Pick<BookProps, "load" | "url">) {
  const { view } = useSite();
  const look = useSiteLook();
  const roots = useMemo(() => tree(view.nav, view.theme.numbering), [view.nav, view.theme.numbering]);
  const pages = useMemo(() => flat(roots).filter((p) => !p.node.locked), [roots]);

  // Each page's view as it arrives, null when it failed; a new view (another context, a refetch) starts again.
  const [got, setGot] = useState<{ from: PageView; pages: Record<string, PageView | null> }>({ from: view, pages: {} });
  if (got.from !== view) setGot({ from: view, pages: {} });
  const fetchPage = useEffectEvent((page: string) => load(page));
  useEffect(() => {
    let live = true;
    void pool(pages, 4, async ({ node }) => {
      const v = node.slug === view.page?.slug ? view : await fetchPage(node.slug).catch(() => null);
      if (live) setGot((g) => (g.from === view ? { ...g, pages: { ...g.pages, [node.slug]: v } } : g));
    });
    return () => {
      live = false;
    };
  }, [pages, view]);
  const loaded = pages.filter((p) => p.node.slug in got.pages).length;
  const ready = loaded === pages.length;

  return (
    <div style={look.style} className={cn(look.className, "@container/site")}>
      <div data-chrome className="mx-auto flex w-full max-w-280 items-center gap-3 px-6 pt-6 @3xl:px-10">
        <p role="status" className="text-muted-foreground min-w-0 flex-1 truncate text-sm">
          {ready ? `${pages.length} ${pages.length === 1 ? "page" : "pages"}, ready to print` : `Gathering pages, ${loaded} of ${pages.length}`}
        </p>
        <Button variant="outline" size="sm" disabled={!ready} onClick={() => window.print()}>
          <IconPrinter aria-hidden />
          Print the book
        </Button>
      </div>

      <header className="mx-auto w-full max-w-280 space-y-3 px-6 pt-[calc(var(--brand-gap)*2)] @3xl:px-10">
        <p className={cn(LABEL, "text-muted-foreground")}>Guidelines</p>
        <h1 className={cn(HEAD, "text-[length:min(var(--brand-h1),10cqi)] leading-[1.1] text-balance")}>{view.brand.name}</h1>
        {view.version?.publishedAt && (
          <p className="text-muted-foreground text-xs">
            Released <LocalDate at={view.version.publishedAt} />
          </p>
        )}
      </header>

      <nav aria-labelledby="book-contents" className="mx-auto w-full max-w-280 px-6 py-[calc(var(--brand-gap)*2)] @3xl:px-10">
        <h2 id="book-contents" className={cn(HEAD, "text-(length:--brand-h3) mb-4")}>
          Contents
        </h2>
        <ol className="max-w-(--brand-measure) divide-y border-y">
          {pages.map(({ node, depth }) => (
            <li key={node.slug} style={{ paddingInlineStart: `${depth * 1.5}rem` }}>
              <a href={`#${node.slug}`} className="hover:bg-muted/50 focus-visible:ring-ring/50 flex gap-3 py-2 outline-none focus-visible:ring-2">
                {node.number && <span className={cn(LABEL, "text-muted-foreground w-12 shrink-0 self-center tabular-nums")}>{node.number}</span>}
                <span className={cn(depth === 0 && "font-medium")}>{node.title}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {pages.map(({ node }) => (
        <Chapter key={node.slug} node={node} roots={roots} view={got.pages[node.slug]} url={url} />
      ))}
    </div>
  );
}

/** One page, on its own sheet, in its own view: its sections' ids take the page's prefix, and its assets sign from it. */
function Chapter({ node, roots, view, url }: { node: NavNode; roots: NavNode[]; view: PageView | null | undefined; url?: Site["url"] }) {
  return (
    <article id={node.slug} aria-label={node.title} className="scroll-mt-16 break-before-page">
      {view?.page ? (
        <SiteProvider view={view} href={href} url={url} idPrefix={prefix(node.slug)}>
          <PageHeader page={view.page} roots={roots} />
          <PageBody page={view.page} />
        </SiteProvider>
      ) : (
        <p className="text-muted-foreground mx-auto w-full max-w-280 px-6 py-12 @3xl:px-10">
          {view === undefined ? `Loading ${node.title}…` : `${node.title} couldn't be loaded. Reload to try again.`}
        </p>
      )}
    </article>
  );
}
