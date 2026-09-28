"use client";

import { useMemo } from "react";
import { IconChevronDown, IconLock } from "@tabler/icons-react";
import { LABEL } from "@/components/brand-sections/look";
import { useSite } from "@/components/site/site-context";
import { type NavNode, trail } from "@/lib/site";
import { cn } from "@/lib/utils";

export type NavTreeProps = {
  roots: NavNode[];
  /** The page being read. */
  current: string | null;
  onNavigate?: (href: string) => void;
};

/** A click the page may take over: a new tab or window, a download or a save keeps the browser's way. */
export const plain = (e: React.MouseEvent) => !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0);

/** A link within the site: a real href, for new tabs and crawlers, and a plain click through `onNavigate` when there is one. */
export function SiteLink({ onNavigate, onClick, ...a }: React.ComponentProps<"a"> & { href: string; onNavigate?: (href: string) => void }) {
  return (
    <a
      {...a}
      onClick={(e) => {
        onClick?.(e);
        if (!onNavigate || e.defaultPrevented || !plain(e)) return;
        e.preventDefault();
        onNavigate(a.href);
      }}
    />
  );
}

/**
 * The site's pages, as a tree: a chapter is a native <details>, open when it
 * holds the page being read, so it folds without script (and animates,
 * globals.css). The pages under a `tabs` page are its tabs, in its header,
 * so they get no rows here. Not the app's Sidebar, whose cookie and Mod+B
 * are the app's.
 */
export function NavTree({ roots, current, onNavigate }: NavTreeProps) {
  const at = useMemo(() => new Set(current ? trail(roots, current).map((n) => n.slug) : []), [roots, current]);
  return (
    <nav aria-label="Guidelines" className="text-sm">
      <Rows nodes={roots} at={at} current={current} onNavigate={onNavigate} />
    </nav>
  );
}

type RowsProps = { nodes: NavNode[]; at: Set<string>; current: string | null; onNavigate?: (href: string) => void };

function Rows({ nodes, ...p }: RowsProps & { nested?: boolean }) {
  return (
    <ul className={cn("space-y-0.5", p.nested && "ms-3 mt-0.5 border-s ps-2")}>
      {nodes.map((n) => (
        <Row key={n.slug} node={n} {...p} />
      ))}
    </ul>
  );
}

function Row({ node: n, at, current, onNavigate }: Omit<RowsProps, "nodes"> & { node: NavNode }) {
  const { href } = useSite();
  const here = n.slug === current;
  // A tab of this page is being read: the page it belongs to is where the reader is.
  const holds = !here && n.tabs && at.has(n.slug);
  const kids = !n.tabs && n.children.length > 0;
  const link = (
    <SiteLink
      href={href(n.slug)}
      onNavigate={onNavigate}
      aria-current={here ? "page" : holds ? "true" : undefined}
      className={cn(
        "focus-visible:ring-ring/50 flex items-baseline gap-2 rounded-md px-2 py-1.5 outline-none focus-visible:ring-2",
        here || holds ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        kids && "pe-9",
      )}
    >
      {n.number && <span className={cn(LABEL, "shrink-0 tabular-nums")}>{n.number}</span>}
      <span className="min-w-0 flex-1 truncate">{n.title}</span>
      {n.locked && (
        <>
          <IconLock aria-hidden className="size-3.5 shrink-0 self-center" />
          <span className="sr-only">(locked)</span>
        </>
      )}
    </SiteLink>
  );
  if (!kids) return <li>{link}</li>;
  return (
    <li className="relative">
      {link}
      <details open={at.has(n.slug)} className="group/chapter">
        {/* The fold sits on the chapter's row; the row itself is the chapter's page. */}
        <summary
          aria-label={`Pages in ${n.title}`}
          className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring/50 absolute end-0 top-0 flex size-8 cursor-pointer list-none items-center justify-center rounded-md outline-none focus-visible:ring-2 [&::-webkit-details-marker]:hidden"
        >
          {/* Closed, it points along the line (to the end); open, down. */}
          <IconChevronDown className="size-4 transition-transform motion-reduce:transition-none ltr:group-not-open/chapter:-rotate-90 rtl:group-not-open/chapter:rotate-90" />
        </summary>
        <Rows nodes={n.children} at={at} current={current} onNavigate={onNavigate} nested />
      </details>
    </li>
  );
}

/**
 * The top pages in a row, for a theme whose nav is `top`: the one being read,
 * or holding it, is marked. Deeper pages stay a click away in the sheet.
 */
export function NavBar({ roots, current, onNavigate }: NavTreeProps) {
  const { href } = useSite();
  const chapter = useMemo(() => (current ? trail(roots, current)[0]?.slug : undefined), [roots, current]);
  return (
    <nav aria-label="Guidelines" className="overflow-x-auto">
      <ul className="flex gap-1 text-sm">
        {roots.map((n) => (
          <li key={n.slug} className="shrink-0">
            <SiteLink
              href={href(n.slug)}
              onNavigate={onNavigate}
              aria-current={n.slug === current ? "page" : n.slug === chapter ? "true" : undefined}
              className={cn(
                "focus-visible:ring-ring/50 flex items-baseline gap-2 rounded-md px-2 py-1 outline-none focus-visible:ring-2",
                n.slug === chapter ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {n.number && <span className={cn(LABEL, "tabular-nums")}>{n.number}</span>}
              {n.title}
              {n.locked && (
                <>
                  <IconLock aria-hidden className="size-3.5 self-center" />
                  <span className="sr-only">(locked)</span>
                </>
              )}
            </SiteLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
