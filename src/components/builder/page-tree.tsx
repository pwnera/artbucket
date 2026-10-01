"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  IconAdjustmentsHorizontal,
  IconChevronRight,
  IconDots,
  IconEye,
  IconEyeOff,
  IconGripVertical,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { BrandTabMenu } from "@/components/brand-tabs";
import { endDrag, payloadOf } from "@/components/builder/drag";
import { Layers } from "@/components/builder/layers";
import type { BuilderApi } from "@/components/builder/use-builder";
import { IconButton } from "@/components/icon-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { apply, type NavEntry, type Op } from "@/lib/builder-ops";
import { AUDIENCES, type Audience, hiddenSlugs, type PageLayout, type PagePatch } from "@/lib/pages";
import { guidelinesPath, type NavNode, trail, tree } from "@/lib/site";
import { cn } from "@/lib/utils";
import { transition } from "@/lib/motion";

/**
 * The book's pages, docked beside the canvas (b.pagesOpen): every page as a
 * tree, the one on show marked. A click is b.open; double-click renames
 * (in the language the canvas shows); the eye hides a page from readers;
 * the menu renames, opens its settings (b.setPageSettings: address, layout,
 * audience, tabs) and deletes. Drag a row onto another to nest it, onto its
 * edge to put it beside, or from the keyboard pick it up by its handle, then
 * Tab and Shift+Tab nest and lift, arrows reorder. A section dragged from the
 * canvas onto a row moves to that page. Add is an `add-page` op, hide a
 * `page` op, delete b.deletePage; each undoes.
 *
 * Under the pages, the page on show's sections and items as layers
 * (layers.tsx).
 *
 * PageTrail is where the bar says which page is on show, and PageSettings
 * the dialog b.pageSettings opens.
 *
 * Props:
 * - b: the builder.
 */
export type PagesPanelProps = {
  b: BuilderApi;
};

type Row = { n: NavNode; depth: number };
const rowsOf = (nodes: NavNode[], depth = 0): Row[] => nodes.flatMap((n) => [{ n, depth }, ...rowsOf(n.children, depth + 1)]);

const byPosition = (a: NavEntry, b: NavEntry) => a.position - b.position || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);

/** Where a page goes: under `parent`, `i`th among the pages there, itself left out (Infinity: last). */
type Place = { parent: string | null; i: number };

/**
 * The `page` op that puts a page at `to`, or null when it is there already.
 * A position counts among every page, as core/pages.ts place() does, so it is
 * the place just before the sibling it goes in front of, or just after the
 * last one.
 */
function moveOp(nav: NavEntry[], slug: string, { parent, i }: Place): Op | null {
  const sorted = [...nav].sort(byPosition);
  const at = sorted.findIndex((p) => p.slug === slug);
  const rest = sorted.filter((p) => p.slug !== slug);
  const sibs = rest.filter((p) => p.parent === parent);
  const position =
    i < sibs.length
      ? rest.indexOf(sibs[Math.max(i, 0)])
      : sibs.length
        ? rest.indexOf(sibs.at(-1)!) + 1
        : parent === null
          ? rest.length
          : rest.findIndex((p) => p.slug === parent) + 1;
  const moved = sorted[at].parent !== parent;
  if (!moved && position === at) return null;
  return { kind: "page", page: slug, op: { op: "page", set: { ...(moved && { parent }), position } } };
}

/** "Voice and tone" to "voice-and-tone", as core/brands.ts slugify; a title with no letters it keeps is "page". */
const slugFor = (title: string) =>
  title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 56)
    .replace(/^-+|-+$/g, "") || "page";

export function PagesPanel({ b }: PagesPanelProps) {
  const nav = b.state.nav;
  const roots = useMemo(() => tree(b.view.nav, b.view.theme.numbering), [b.view.nav, b.view.theme.numbering]);
  const hidden = useMemo(() => hiddenSlugs(nav), [nav]);
  const move = (slug: string, to: Place) => {
    const op = moveOp(nav, slug, to);
    if (op) b.apply(op);
  };
  const siblings = (parent: string | null) => nav.filter((p) => p.parent === parent).sort(byPosition);
  const toggle = (p: NavEntry) => b.apply({ kind: "page", page: p.slug, op: { op: "page", set: { hidden: !p.hidden } } });

  return (
    <aside
      aria-label="Pages"
      className="app-tokens bg-background text-foreground sticky top-12 flex h-[calc(100dvh-3rem)] w-60 shrink-0 flex-col border-e font-sans"
    >
      <div className="flex h-11 shrink-0 items-center gap-1 border-b ps-3 pe-1.5">
        <h2 className="text-sm font-medium">Pages</h2>
        <span className="text-muted-foreground text-xs tabular-nums">{nav.length}</span>
        <span className="ms-auto flex items-center">
          <AddPage b={b} />
          <IconButton variant="ghost" size="icon-sm" label="Hide the page list" onClick={() => b.setPagesOpen(false)}>
            <IconLayoutSidebarLeftCollapse />
          </IconButton>
        </span>
      </div>
      {/* The book's pages above, the page on show's layers below, as a design tool keeps pages over layers. */}
      <div className="max-h-[45%] min-h-0 shrink-0 overflow-y-auto p-1.5">
        <Outline b={b} rows={rowsOf(roots)} hidden={hidden} onToggle={toggle} onMove={move} siblings={siblings} />
      </div>
      <div className="flex h-9 shrink-0 items-center gap-1 border-y ps-3 pe-1.5">
        <h2 className="text-sm font-medium">Layers</h2>
        <span className="text-muted-foreground text-xs tabular-nums">{b.state.pages.get(b.state.selection.page)?.length ?? ""}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        <Layers b={b} />
      </div>
    </aside>
  );
}

/**
 * Which page is on show, in the bar: Brands, the brand (its tabs, as a
 * menu), Guidelines (the brand's pages read-only), the pages above it, and
 * its title, which opens its settings. With the page
 * list closed, a button before them opens it again.
 */
export function PageTrail({ b }: { b: BuilderApi }) {
  const roots = useMemo(() => tree(b.view.nav, b.view.theme.numbering), [b.view.nav, b.view.theme.numbering]);
  const current = b.state.selection.page;
  const path = trail(roots, current);
  const here = path.at(-1);
  return (
    <nav aria-label="Where you are" className="flex min-w-0 items-center gap-1 text-sm">
      {!b.pagesOpen && (
        <IconButton variant="ghost" size="icon-sm" label="Show the page list" onClick={() => b.setPagesOpen(true)}>
          <IconLayoutSidebarLeftExpand />
        </IconButton>
      )}
      {/* As the prototype's builder names it: Brands / the brand / Guidelines / the page. */}
      <Link href="/brands" className="text-muted-foreground hover:text-foreground hidden shrink-0 rounded-sm px-1 outline-none focus-visible:ring-2 @3xl/bar:block">
        Brands
      </Link>
      <IconChevronRight aria-hidden className="text-muted-foreground hidden size-3.5 shrink-0 @3xl/bar:block" />
      {/* Focus mode: the brand's tabs, folded into a menu on its name. Rules open here, on the page on show. */}
      <BrandTabMenu brand={b.view.brand} at="guidelines" here={{ rules: () => b.setPanel("rules") }} />
      <IconChevronRight aria-hidden className="text-muted-foreground hidden size-3.5 shrink-0 @3xl/bar:block" />
      {/* The brand's Guidelines tab: its pages as readers see them, the builder left for it. */}
      <Link
        href={guidelinesPath(b.view.brand.slug)}
        className="text-muted-foreground hover:text-foreground hidden shrink-0 rounded-sm px-1 outline-none focus-visible:ring-2 @3xl/bar:block"
      >
        Guidelines
      </Link>
      {path.slice(0, -1).map((n) => (
        <span key={n.slug} className="text-muted-foreground hidden min-w-0 items-center gap-1 @3xl/bar:flex">
          <IconChevronRight aria-hidden className="size-3.5 shrink-0" />
          <button type="button" onClick={() => b.open(n.slug)} className="hover:text-foreground max-w-32 truncate rounded-sm outline-none focus-visible:ring-2">
            {n.title}
          </button>
        </span>
      ))}
      {here && (
        <>
          <IconChevronRight aria-hidden className="text-muted-foreground hidden size-3.5 shrink-0 @3xl/bar:block" />
          <button
            type="button"
            title="Page settings"
            onClick={() => b.setPageSettings(here.slug)}
            className="hover:bg-accent focus-visible:ring-ring/50 flex h-7 min-w-0 items-center gap-1 rounded-md px-1.5 font-medium outline-none focus-visible:ring-2"
          >
            <span className="truncate">{here.title}</span>
            {b.state.nav.find((p) => p.slug === here.slug)?.hidden && <HiddenMark className="text-muted-foreground size-3.5" />}
            <IconAdjustmentsHorizontal aria-hidden className="text-muted-foreground size-3.5 shrink-0" />
          </button>
        </>
      )}
    </nav>
  );
}

/** The settings of the page b.pageSettings names. */
export function PageSettings({ b }: { b: BuilderApi }) {
  const entry = b.pageSettings ? b.state.nav.find((p) => p.slug === b.pageSettings) : undefined;
  return entry ? <Details key={entry.slug} b={b} entry={entry} onClose={() => b.setPageSettings(null)} /> : null;
}

/** A page kept from readers: the eye, and words for a screen reader. */
const HiddenMark = ({ className }: { className?: string }) => (
  <>
    <IconEyeOff aria-hidden className={className} />
    <span className="sr-only">(hidden)</span>
  </>
);

/** A page's title, typed in place: Enter or leaving keeps it, Esc puts it back. */
function RenameInput({ title, onDone }: { title: string; onDone: (title: string) => void }) {
  const kept = useRef(true);
  return (
    <input
      // A double-click asked to type here.
      autoFocus
      defaultValue={title}
      maxLength={120}
      aria-label="Page title"
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => onDone(kept.current ? e.currentTarget.value.trim() : title)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          kept.current = false;
          e.currentTarget.blur();
        }
      }}
      className="bg-background focus-visible:ring-ring/50 h-7 w-40 min-w-0 flex-1 rounded-md px-2 text-sm outline-none focus-visible:ring-2"
    />
  );
}

/**
 * Every page as a tree, to arrange: drag a row onto another's middle to nest
 * it there, onto its top or bottom edge to put it beside. From the keyboard,
 * Space on a row's handle picks it up; then Tab nests it under the page above,
 * Shift+Tab lifts it out, Up and Down move it among its siblings, and Space
 * puts it down. Only a page picked up takes Tab, so Tab still walks the rows.
 */
function Outline({
  b,
  rows,
  hidden,
  onToggle,
  onMove,
  siblings,
}: {
  b: BuilderApi;
  rows: Row[];
  hidden: Set<string>;
  onToggle: (p: NavEntry) => void;
  onMove: (slug: string, to: Place) => void;
  siblings: (parent: string | null) => NavEntry[];
}) {
  const nav = b.state.nav;
  const entry = (slug: string) => nav.find((p) => p.slug === slug)!;
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ slug: string; zone: "before" | "into" | "after" } | null>(null);
  const [held, setHeld] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  // A section dragged over a page's row: dropped, it moves to that page.
  const [dropOn, setDropOn] = useState<string | null>(null);
  const current = b.state.selection.page;

  /** The title, or in the language the canvas shows, its word there. */
  const rename = (slug: string, title: string) => {
    const p = nav.find((x) => x.slug === slug);
    const lang = b.state.lang;
    if (!p) return;
    const set: PagePatch = lang ? { translations: { ...p.translations, [lang]: { ...p.translations?.[lang], title } } } : { title };
    b.apply({ kind: "page", page: slug, op: { op: "page", set } });
  };
  // A row moved in the list can lose focus on the way: the handle takes it back, still holding the page.
  const moving = useRef(false);
  const hint = "page-tree-hint";

  /** Whether `slug` is `root` or sits somewhere under it: no page goes inside itself. */
  const within = (slug: string, root: string) => {
    for (let p: NavEntry | undefined = entry(slug); p; p = p.parent === null ? undefined : entry(p.parent)) if (p.slug === root) return true;
    return false;
  };

  const onKey = (e: React.KeyboardEvent, slug: string) => {
    if (held !== slug) return;
    const p = entry(slug);
    const sibs = siblings(p.parent);
    const k = sibs.indexOf(p);
    let to: Place | null = null;
    if (e.key === "Tab" && !e.shiftKey && !e.altKey && k > 0) to = { parent: sibs[k - 1].slug, i: Infinity };
    else if (e.key === "Tab" && e.shiftKey && p.parent !== null) {
      const up = entry(p.parent);
      to = { parent: up.parent, i: siblings(up.parent).indexOf(up) + 1 };
    } else if (e.key === "ArrowUp" && k > 0) to = { parent: p.parent, i: k - 1 };
    else if (e.key === "ArrowDown" && k >= 0 && k < sibs.length - 1) to = { parent: p.parent, i: k + 1 };
    // Held, the keys that move it never do anything else, even where it can't go.
    if (e.key === "Tab" || e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault();
    if (!to) return;
    moving.current = true;
    transition(() => {
      onMove(slug, to);
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`[data-move="${slug}"]`)?.focus();
        moving.current = false;
      });
    });
  };

  const drop = (target: string, zone: "before" | "into" | "after") => {
    if (!drag || within(target, drag)) return;
    const t = entry(target);
    if (zone === "into") return transition(() => onMove(drag, { parent: t.slug, i: Infinity }));
    const i = siblings(t.parent)
      .filter((p) => p.slug !== drag)
      .indexOf(t);
    transition(() => onMove(drag, { parent: t.parent, i: zone === "before" ? i : i + 1 }));
  };

  return (
    <div className="grid gap-1">
      <ul aria-label="Every page" aria-describedby={hint} className="grid gap-px">
        {rows.map(({ n, depth }) => {
          const p = entry(n.slug);
          const kids = nav.some((q) => q.parent === n.slug);
          const zone = over?.slug === n.slug ? over.zone : null;
          return (
            <li
              key={n.slug}
              data-page-row={n.slug}
              data-vt={`page-${n.slug}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", n.slug);
                setDrag(n.slug);
              }}
              onDragEnd={() => {
                setDrag(null);
                setOver(null);
              }}
              onDragOver={(e) => {
                const p = payloadOf(e);
                if (p?.kind === "section") {
                  if (n.slug === current) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dropOn !== n.slug) setDropOn(n.slug);
                  return;
                }
                if (!drag || within(n.slug, drag)) return over && setOver(null);
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                const y = (e.clientY - r.top) / r.height;
                const z = y < 0.25 ? "before" : y > 0.75 ? "after" : "into";
                if (zone !== z) setOver({ slug: n.slug, zone: z });
              }}
              onDragLeave={() => setDropOn((d) => (d === n.slug ? null : d))}
              onDrop={(e) => {
                e.preventDefault();
                const p = payloadOf(e);
                setDropOn(null);
                if (p?.kind === "section") {
                  endDrag();
                  return void b.moveToPage(p.id, n.slug);
                }
                if (zone) drop(n.slug, zone);
                setDrag(null);
                setOver(null);
              }}
              style={{ paddingInlineStart: `${depth * 1}rem` }}
              className={cn(
                "group/row flex items-center gap-1 rounded-md border-y-2 border-transparent",
                zone === "before" && "border-t-primary",
                zone === "after" && "border-b-primary",
                zone === "into" && "bg-primary/10",
                drag === n.slug && "opacity-50",
                n.slug === current && zone !== "into" && "bg-muted",
                dropOn === n.slug && "ring-primary bg-primary/10 ring-2",
              )}
              title={dropOn === n.slug ? `Drop to move the section to ${n.title}` : undefined}
            >
              <button
                type="button"
                aria-label={`Move ${n.title}`}
                aria-pressed={held === n.slug}
                aria-describedby={hint}
                onClick={() => setHeld(held === n.slug ? null : n.slug)}
                onBlur={() => !moving.current && held === n.slug && setHeld(null)}
                data-move={n.slug}
                onKeyDown={(e) => onKey(e, n.slug)}
                className={cn(
                  "text-muted-foreground focus-visible:ring-ring/50 flex size-5 shrink-0 cursor-grab items-center justify-center rounded-sm opacity-0 outline-none group-hover/row:opacity-100 focus-visible:opacity-100 focus-visible:ring-2",
                  held === n.slug && "bg-primary text-primary-foreground opacity-100",
                )}
              >
                <IconGripVertical aria-hidden className="size-4" />
              </button>
              {renaming === n.slug ? (
                <RenameInput
                  title={n.title}
                  onDone={(title) => {
                    setRenaming(null);
                    if (title && title !== n.title) rename(n.slug, title);
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => b.open(n.slug)}
                  onDoubleClick={() => setRenaming(n.slug)}
                  aria-current={n.slug === current ? "page" : undefined}
                  title="Double-click to rename"
                  className={cn(
                    "focus-visible:ring-ring/50 flex min-w-0 flex-1 items-center gap-1.5 rounded-sm py-1 text-start text-sm outline-none focus-visible:ring-2",
                    n.slug === current && "font-medium",
                    hidden.has(n.slug) && "text-muted-foreground",
                  )}
                >
                  {n.number && <span className="text-muted-foreground font-mono text-xs tabular-nums">{n.number}</span>}
                  <span className="truncate">{n.title}</span>
                </button>
              )}
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={p.hidden ? `Show ${n.title} to readers` : `Hide ${n.title} from readers`}
                aria-pressed={p.hidden}
                title={p.hidden ? "Hidden: show to readers" : "Hide from readers"}
                onClick={() => onToggle(p)}
                className={cn(!p.hidden && "opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100")}
              >
                {p.hidden ? <IconEyeOff /> : <IconEye />}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-xs" aria-label={`More for ${n.title}`} className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100">
                    <IconDots />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="app-tokens">
                  <DropdownMenuItem onSelect={() => setRenaming(n.slug)}>
                    <IconPencil /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => b.setPageSettings(n.slug)}>
                    <IconAdjustmentsHorizontal /> Page settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onToggle(p)}>
                    {p.hidden ? <IconEye /> : <IconEyeOff />} {p.hidden ? "Show to readers" : "Hide from readers"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" disabled={kids} onSelect={() => void b.deletePage(n.slug)}>
                    <IconTrash /> {kids ? "Delete (move the pages under it first)" : "Delete"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          );
        })}
      </ul>
      <p id={hint} className="text-muted-foreground px-2 pt-2 text-xs">
        Drag a page onto another to nest it. Or press Space on its handle, then Tab nests, Shift+Tab lifts out, arrows reorder, Space puts it down.
      </p>
    </div>
  );
}

/** A new page at the end of the book, named first: its slug comes from the title, and it opens. */
function AddPage({ b }: { b: BuilderApi }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const taken = new Set(b.state.nav.flatMap((p) => [p.slug, ...p.aliases]));
  const base = slugFor(title);
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    if (!b.apply({ kind: "add-page", page: { slug, title: t }, sections: [] })) return;
    b.open(slug);
    setOpen(false);
    setTitle("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Add a page" title="Add a page">
          <IconPlus />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <form onSubmit={add} className="grid gap-2">
          <Label htmlFor="new-page-title">New page</Label>
          <Input id="new-page-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Voice and tone" autoComplete="off" />
          <p className="text-muted-foreground truncate text-xs">
            Its address: <span className="font-mono">/{slug}</span>
          </p>
          <Button type="submit" size="sm" disabled={!title.trim()}>
            Add page
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

const AUDIENCE_WORDS: Record<Audience, string> = {
  everyone: "Everyone",
  partners: "Partners (a password or an approved request)",
  members: "Members only",
};

/** A page's settings: title, address (a rename keeps the old one working), layout, who reads it on portals, tabs. */
function Details({ b, entry, onClose }: { b: BuilderApi; entry: NavEntry; onClose: () => void }) {
  const [title, setTitle] = useState(entry.title);
  const [slug, setSlug] = useState(entry.slug);
  const [layout, setLayout] = useState<PageLayout>(entry.layout);
  const [audience, setAudience] = useState<Audience>(entry.audience);
  const [tabs, setTabs] = useState(entry.tabs);
  const [error, setError] = useState<string | null>(null);
  const hasKids = b.state.nav.some((p) => p.parent === entry.slug);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const set: PagePatch = {
      ...(title.trim() !== entry.title && { title: title.trim() }),
      ...(slug.trim() !== entry.slug && { slug: slug.trim() }),
      ...(layout !== entry.layout && { layout }),
      ...(audience !== entry.audience && { audience }),
      ...(tabs !== entry.tabs && { tabs }),
    };
    if (!Object.keys(set).length) return onClose();
    const op: Op = { kind: "page", page: entry.slug, op: { op: "page", set } };
    // Tried first, so a taken or malformed slug is said here rather than in a toast.
    const tried = apply(b.state, op);
    if (tried.errors.length) return setError(tried.errors[0].replace(/^op\.set\./, ""));
    b.apply(op);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="app-tokens">
        <DialogHeader>
          <DialogTitle>Page settings</DialogTitle>
          <DialogDescription>How {entry.title} sits in the book, and who reads it.</DialogDescription>
        </DialogHeader>
        <form id="page-details" onSubmit={save} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="page-title">Title</Label>
            <Input id="page-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="page-slug">Address</Label>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground font-mono text-sm">/</span>
              <Input
                id="page-slug"
                value={slug}
                onChange={(e) => (setSlug(e.target.value), setError(null))}
                maxLength={60}
                aria-invalid={!!error || undefined}
                aria-describedby="page-slug-hint"
                className="font-mono"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <p id="page-slug-hint" className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")}>
              {error ??
                (entry.aliases.length
                  ? `Old addresses still lead here: ${entry.aliases.map((a) => `/${a}`).join(", ")}.`
                  : "Change it and the old address still leads here.")}
            </p>
          </div>
          <div className="grid gap-1.5">
            <p id="page-layout" className="text-sm font-medium">
              Layout
            </p>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={layout}
              onValueChange={(v) => v && setLayout(v as PageLayout)}
              aria-labelledby="page-layout"
            >
              <ToggleGroupItem value="book" className="px-3">
                Book
              </ToggleGroupItem>
              <ToggleGroupItem value="landing" className="px-3">
                Landing
              </ToggleGroupItem>
            </ToggleGroup>
            <p className="text-muted-foreground text-xs">
              {layout === "book" ? "A chapter: the page list beside it, on this page, and the pager." : "A front: no page list, on this page or pager. For a home or a campaign."}
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="page-audience">Who reads it on portals</Label>
            <Select value={audience} onValueChange={(v) => setAudience(v as Audience)}>
              <SelectTrigger id="page-audience" size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="app-tokens">
                {AUDIENCES.map((a) => (
                  <SelectItem key={a} value={a}>
                    {AUDIENCE_WORDS[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <Switch id="page-tabs" checked={tabs} onCheckedChange={setTabs} />
            <Label htmlFor="page-tabs" className="leading-snug font-normal">
              Show the pages under it as tabs across its top{!hasKids && " (it has none yet)"}
            </Label>
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="page-details">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
