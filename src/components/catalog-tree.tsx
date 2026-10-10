"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { IconArrowUpRight, IconChevronRight, IconFolder, IconFolderOpen, IconLayoutSidebarLeftCollapse, IconLock, IconShare, IconSitemap } from "@tabler/icons-react";
import { TypeIcon, type TreeProject } from "@/components/catalog";
import { IconButton } from "@/components/icon-button";
import { Input } from "@/components/ui/input";
import { TYPE_LABEL, type CatalogType } from "@/lib/catalog";
import type { CatalogItem } from "@/lib/core/catalog";
import { cn } from "@/lib/utils";

/**
 * The catalog as a tree, Unity Catalog's way: projects, then a folder per
 * type, then objects, and a brand's rules and guideline pages inside it.
 * Every level folds; the path to the object open stays unfolded, and a
 * filter unfolds whatever matches. Arrow keys move, Right and Left fold,
 * Enter opens.
 */

type Node = { key: string; depth: number; label: string; count?: number; item?: CatalogItem; kind: "project" | "group" | "object"; type?: CatalogType; children: Node[] };

const ORDER: CatalogType[] = ["brand", "collection", "asset", "portal"];
const LIST: Partial<Record<CatalogType, { href: string; label: string }>> = {
  brand: { href: "/brands", label: "All brands" },
  asset: { href: "/?browse", label: "Browse the assets in Explore" },
  portal: { href: "/portals", label: "Manage portals" },
};
const PARTS: CatalogType[] = ["rule", "page"];

function build(projects: TreeProject[], match: (i: CatalogItem) => boolean): Node[] {
  return projects.map((p) => {
    const parts = p.objects.filter((o) => o.parent);
    const objects = p.objects.filter((o) => !o.parent);
    const groups = ORDER.flatMap((t) => {
      const list = objects
        .filter((o) => o.type === t)
        .map((o): Node => {
          const kids = PARTS.flatMap((pt) => {
            const mine = parts.filter((x) => x.parent?.id === o.id && !!x.sharedFrom === !!o.sharedFrom && x.type === pt && match(x));
            return mine.length
              ? [
                  {
                    key: `${p.id}:${o.id}:${pt}`,
                    depth: 4,
                    label: TYPE_LABEL[pt].many,
                    count: mine.length,
                    kind: "group" as const,
                    type: pt,
                    children: mine.map((x) => ({ key: `${p.id}:${x.id}`, depth: 5, label: x.name, item: x, kind: "object" as const, children: [] })),
                  },
                ]
              : [];
          });
          return { key: o.sharedFrom ? `${p.id}:${o.id}` : o.id, depth: 3, label: o.name, item: o, kind: "object", children: kids };
        })
        .filter((n) => match(n.item!) || n.children.length);
      return list.length ? [{ key: `${p.id}:${t}`, depth: 2, label: TYPE_LABEL[t].many, count: list.length, kind: "group" as const, type: t, children: list }] : [];
    });
    return { key: p.id, depth: 1, label: p.name, count: groups.reduce((s, g) => s + (g.count ?? 0), 0), kind: "project", children: groups };
  });
}

/** Keys from the root down to the object open, so its path shows unfolded. */
function pathTo(nodes: Node[], id: string | null, trail: string[] = []): string[] | null {
  if (!id) return null;
  for (const n of nodes) {
    if (n.key === id) return trail;
    const found = pathTo(n.children, id, [...trail, n.key]);
    if (found) return found;
  }
  return null;
}

export function CatalogTree({ projects, current, onOpen, onHide }: { projects: TreeProject[]; current: string | null; onOpen: (id: string) => void; onHide: () => void }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const match = useMemo(() => (i: CatalogItem) => !q || i.name.toLowerCase().includes(q) || i.address.includes(q), [q]);
  const tree = useMemo(() => build(projects, match), [projects, match]);
  // Projects start unfolded, and the path to what is open; the rest folds until asked.
  const [open, setOpen] = useState<Set<string>>(() => new Set([...projects.map((p) => p.id), ...(pathTo(build(projects, () => true), current) ?? [])]));
  const isOpen = (n: Node) => !!q || open.has(n.key);
  const toggle = (key: string, to?: boolean) =>
    setOpen((o) => {
      const next = new Set(o);
      if (to ?? !next.has(key)) next.add(key);
      else next.delete(key);
      return next;
    });

  const visible: Node[] = [];
  const walk = (list: Node[]) => {
    for (const n of list) {
      visible.push(n);
      if (n.children.length && isOpen(n)) walk(n.children);
    }
  };
  walk(tree);
  const [focus, setFocus] = useState<string | null>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const move = (to: number) => {
    const n = visible[Math.max(0, Math.min(visible.length - 1, to))];
    if (!n) return;
    setFocus(n.key);
    rowsRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(n.key)}"]`)?.focus();
  };
  const total = tree.reduce((s, p) => s + (p.count ?? 0), 0);

  return (
    <section aria-label="Catalog" className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b p-3">
        <div className="flex items-center gap-2 ps-1">
          <IconSitemap aria-hidden className="text-muted-foreground size-4" />
          <h1 className="font-display text-base font-semibold tracking-tight">Catalog</h1>
          <span className="text-muted-foreground text-xs tabular-nums">{total}</span>
          <IconButton variant="ghost" size="icon-xs" label="Hide the tree" className="text-muted-foreground ms-auto" onClick={onHide}>
            <IconLayoutSidebarLeftCollapse />
          </IconButton>
        </div>
        <Input type="search" placeholder="Filter by name or address" aria-label="Filter the tree" value={query} onChange={(e) => setQuery(e.target.value)} className="h-8" />
      </div>
      <div ref={rowsRef} role="tree" aria-label="Projects and objects" className="min-h-0 flex-1 overflow-y-auto py-1.5">
        {visible.map((n, i) => {
          const expandable = n.children.length > 0;
          const selected = n.item?.id === current;
          return (
            <div
              key={n.key}
              data-key={n.key}
              role="treeitem"
              aria-level={n.depth}
              aria-expanded={expandable ? isOpen(n) : undefined}
              aria-selected={selected}
              tabIndex={(focus ?? current ?? visible[0]?.key) === n.key ? 0 : -1}
              onFocus={() => setFocus(n.key)}
              onClick={() => (n.item ? onOpen(n.item.id) : toggle(n.key))}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") move(i + 1);
                else if (e.key === "ArrowUp") move(i - 1);
                else if (e.key === "ArrowRight" && expandable) toggle(n.key, true);
                else if (e.key === "ArrowLeft") {
                  if (expandable && isOpen(n)) toggle(n.key, false);
                  else {
                    // Up to the row it sits in.
                    let up = i - 1;
                    while (up > 0 && visible[up].depth >= n.depth) up--;
                    move(up);
                  }
                } else if (e.key === "Enter" || e.key === " ") {
                  if (n.item) onOpen(n.item.id);
                  else toggle(n.key);
                }
                else return;
                e.preventDefault();
              }}
              style={{ paddingInlineStart: `${(n.depth - 1) * 14 + 6}px` }}
              className={cn(
                "group/row mx-1.5 flex h-7 cursor-pointer items-center gap-1.5 rounded-md pe-2 text-sm outline-none select-none",
                "focus-visible:ring-ring/50 focus-visible:ring-2",
                selected ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "hover:bg-accent",
                n.kind === "project" && "font-medium",
              )}
            >
              <span
                aria-hidden
                onClick={(e) => {
                  if (!expandable) return;
                  e.stopPropagation();
                  toggle(n.key);
                }}
                className={cn("text-muted-foreground flex size-4 shrink-0 items-center justify-center", !expandable && "invisible")}
              >
                <IconChevronRight className={cn("size-3.5 transition-transform duration-150", isOpen(n) && "rotate-90")} />
              </span>
              {n.kind === "object" && n.item ? (
                <TypeIcon type={n.item.type} className="text-muted-foreground size-4 shrink-0" />
              ) : n.kind === "group" ? (
                isOpen(n) ? (
                  <IconFolderOpen aria-hidden className="text-muted-foreground size-4 shrink-0" />
                ) : (
                  <IconFolder aria-hidden className="text-muted-foreground size-4 shrink-0" />
                )
              ) : (
                <span aria-hidden className="bg-primary/15 text-primary-ink flex size-4 shrink-0 items-center justify-center rounded text-[10px] font-semibold">
                  {n.label.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="truncate">{n.label}</span>
              {n.item?.private && <IconLock aria-label="Private" className="text-muted-foreground size-3.5 shrink-0" />}
              {n.kind === "object" && n.depth === 3 && n.item?.sharedFrom && (
                <span title={`Shared from ${n.item.sharedFrom.name}`} className="bg-primary/10 text-primary-ink inline-flex shrink-0 items-center gap-0.5 rounded px-1 text-[10px] font-medium">
                  <IconShare aria-hidden className="size-3" /> Shared
                </span>
              )}
              <span className="text-muted-foreground ms-auto ps-2 text-xs tabular-nums">
                {n.count ?? (n.item?.release ? `@${n.item.release}` : n.item?.status === "draft" ? "draft" : "")}
              </span>
              {/* A type's folder leads to where its things are made and managed. */}
              {n.kind === "group" && n.depth === 2 && n.type && LIST[n.type] && (
                <Link
                  href={LIST[n.type]!.href}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={LIST[n.type]!.label}
                  title={LIST[n.type]!.label}
                  className="text-muted-foreground hover:text-foreground -me-1 flex size-5 items-center justify-center rounded opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
                >
                  <IconArrowUpRight className="size-3.5" />
                </Link>
              )}
            </div>
          );
        })}
        {!visible.length && <p className="text-muted-foreground px-4 py-2 text-xs">{q ? "Nothing matches." : "Nothing here yet."}</p>}
      </div>
    </section>
  );
}
