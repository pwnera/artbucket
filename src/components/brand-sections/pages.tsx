"use client";

import { useMemo } from "react";
import { IconLock } from "@/components/icons";
import { HEAD, LABEL } from "@/components/brand-sections/look";
import { Body, ItemText, ItemTitle, itemRoot, useSection } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { useMedia, useSite } from "@/components/site/site-context";
import { SITE_PATH } from "@/lib/markdown";
import { type NavNode, trail, tree } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * Where to go next: the pages its items pick, else the children of `from`
 * (this page when left out), as cards with their cover, eyebrow and lede,
 * or as a list. A list with `depth` goes that many levels down: a table of
 * contents. Locked pages show, with a lock, and lead to their door.
 */

/** Cards per row, as the section's container widens. */
const GRID: Record<number, string> = {
  1: "",
  2: "@xl:grid-cols-2",
  3: "@xl:grid-cols-2 @4xl:grid-cols-3",
  4: "@xl:grid-cols-2 @4xl:grid-cols-4",
};

/** A page shown: from the nav, and the item that picked it, if one did. */
type Pick = { node: NavNode; k?: number; section?: string };

export function PagesSection({ section: s }: SectionProps) {
  const { view } = useSite();
  const numbering = view.theme.numbering;
  const roots = useMemo(() => tree(view.nav, numbering), [view.nav, numbering]);
  const find = (slug: string) => trail(roots, slug).at(-1);
  const from = typeof s.props.from === "string" ? s.props.from : view.page?.slug;
  // A page the reader can't see isn't in the nav, so an item picking it shows nothing.
  const picks: Pick[] = s.items?.length
    ? s.items.flatMap((it, k) => {
        const m = SITE_PATH.exec(it.link ?? "");
        const node = m?.[1] ? find(m[1]) : undefined;
        return node ? [{ node, k, section: m?.[2] }] : [];
      })
    : (from ? (find(from)?.children ?? []) : []).map((node) => ({ node }));
  const list = s.props.layout === "list";
  const depth = typeof s.props.depth === "number" ? s.props.depth : 1;
  return (
    <div className="space-y-6">
      <Body />
      {picks.length > 0 &&
        (list ? (
          <ol className="divide-y border-y">
            {picks.map((p) => (
              <Row key={p.node.slug + (p.section ?? "")} {...p} left={depth - 1} ledes={depth === 1} />
            ))}
          </ol>
        ) : (
          <ul className={cn("grid gap-4", GRID[s.columns])}>
            {picks.map((p) => (
              <Card key={p.node.slug + (p.section ?? "")} {...p} />
            ))}
          </ul>
        ))}
    </div>
  );
}

/** Where a pick leads, and whether it's the page being read. */
function useLink({ node, section }: Pick) {
  const { href, view } = useSite();
  return { url: href(node.slug, section), current: node.slug === view.page?.slug && !section };
}

/** The item that picked the page; none when the section shows a page's children. */
function useItem(k: number | undefined) {
  const { items } = useSection();
  return k === undefined ? undefined : items?.[k];
}

/** The item's own title, else the page's. */
function PageTitle({ node, k, as, className }: Pick & { as: "h3" | "p"; className?: string }) {
  const it = useItem(k);
  if (k !== undefined && it?.title) return <ItemTitle i={k} as={as} className={className} />;
  const H = as;
  return <H className={cn(HEAD, "text-(length:--brand-h3) leading-snug text-balance", className)}>{node.title}</H>;
}

/** The item's own words, else the page's lede. */
function PageText({ node, k }: Pick) {
  const it = useItem(k);
  if (k !== undefined && it?.text) return <ItemText i={k} className="text-muted-foreground" />;
  return node.lede ? <p className="text-muted-foreground text-sm text-pretty">{node.lede}</p> : null;
}

function Lock() {
  return (
    <>
      <IconLock aria-hidden className="text-muted-foreground size-4 shrink-0" />
      <span className="sr-only">Locked</span>
    </>
  );
}

/**
 * A page as a card: its cover, number and eyebrow, title, lede. The link lies
 * over the whole card; links in an item's own words sit above it.
 */
function Card(p: Pick) {
  const it = useItem(p.k);
  const { url } = useSite();
  const cover = useMedia(it?.asset ?? p.node.cover ?? undefined);
  const link = useLink(p);
  const name = it?.title ?? p.node.title;
  return (
    <li {...itemRoot(p.k)} className="bg-card text-card-foreground hover:border-foreground/30 relative flex flex-col overflow-hidden rounded-xl border transition-colors">
      {cover?.thumbnail && (
        <div className="bg-muted relative aspect-[16/9] overflow-hidden border-b">
          {/* The card's title names the page, so its cover says nothing more. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url(cover.id, "/w_640,f_webp")}
            // Twice as wide for a sharp card on a high-density screen, as Thumb does.
            srcSet={`${url(cover.id, "/w_1280,f_webp")} 2x`}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 p-4 [&_a]:relative [&_a]:z-10">
        {(p.node.number || p.node.eyebrow) && (
          <p className={cn(LABEL, "text-muted-foreground flex gap-2")}>
            {p.node.number && <span className="tabular-nums">{p.node.number}</span>}
            {p.node.eyebrow && <span>{p.node.eyebrow}</span>}
          </p>
        )}
        <div className="flex items-start gap-2">
          <PageTitle {...p} as="h3" />
          {p.node.locked && <Lock />}
        </div>
        <PageText {...p} />
      </div>
      <a
        href={link.url}
        aria-current={link.current ? "page" : undefined}
        aria-label={p.node.locked ? `${name}, locked` : name}
        className="absolute inset-0 rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-(--brand-accent) focus-visible:ring-inset"
      />
    </li>
  );
}

/**
 * A page as a line of a list: its number and title as the link, its lede when
 * the list goes one level only, and its children for `left` levels more.
 */
function Row({ left, ledes, nested, ...p }: Pick & { left: number; ledes: boolean; nested?: boolean }) {
  const link = useLink(p);
  return (
    <li {...itemRoot(p.k)} className={nested ? "pt-1.5" : "py-3"}>
      <a
        href={link.url}
        aria-current={link.current ? "page" : undefined}
        className="group flex items-baseline gap-3 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-(--brand-accent)"
      >
        {p.node.number && <span className={cn(LABEL, "text-muted-foreground w-10 shrink-0 tabular-nums")}>{p.node.number}</span>}
        <PageTitle {...p} as="p" className={cn("group-hover:underline", nested ? "text-sm" : "text-base")} />
        {p.node.locked && <Lock />}
      </a>
      {ledes && (
        <div className={cn("mt-1", p.node.number && "ps-13")}>
          <PageText {...p} />
        </div>
      )}
      {left > 0 && p.node.children.length > 0 && (
        <ol className={cn("pb-1", p.node.number ? "ps-13" : "ps-4")}>
          {p.node.children.map((node) => (
            <Row key={node.slug} node={node} left={left - 1} ledes={false} nested />
          ))}
        </ol>
      )}
    </li>
  );
}
