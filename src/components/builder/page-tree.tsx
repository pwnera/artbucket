"use client";

import { useMemo, useRef, useState } from "react";
import {
  IconAdjustmentsHorizontal,
  IconChevronDown,
  IconDots,
  IconEye,
  IconEyeOff,
  IconGripVertical,
  IconListTree,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { endDrag, payloadOf } from "@/components/builder/drag";
import type { BuilderApi } from "@/components/builder/use-builder";
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
import { type NavNode, trail, tree } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * Page tabs over the tree (build spec 3.5.3, W6.3), in the top bar: a
 * dropdown per chapter, b.state.nav with hidden pages marked; a click is
 * b.open; double-click renames the title; Details sets the slug (a `page`
 * op, which leaves an alias), layout (Book or Landing), audience and tabs.
 * The tree itself sits behind the first button: drag a row onto another to
 * nest it (its top or bottom edge to put it beside), or from the keyboard
 * pick it up by its handle, then Tab and Shift+Tab nest and lift, arrows
 * reorder. Add is an `add-page` op, hide a `page` op, delete b.deletePage;
 * each undoes.
 *
 * Props:
 * - b: the builder.
 */
export type PageTreeProps = {
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

export function PageTree({ b }: PageTreeProps) {
  const nav = b.state.nav;
  const current = b.state.selection.page;
  const roots = useMemo(() => tree(b.view.nav, b.view.theme.numbering), [b.view.nav, b.view.theme.numbering]);
  const bySlug = useMemo(() => new Map(nav.map((p) => [p.slug, p])), [nav]);
  const hidden = useMemo(() => hiddenSlugs(nav), [nav]);
  const top = trail(roots, current)[0]?.slug;
  const [renaming, setRenaming] = useState<string | null>(null);
  const [details, setDetails] = useState<string | null>(null);
  const [outline, setOutline] = useState(false);
  // A section dragged over a page's tab: dropped, it moves to that page.
  const [dropOn, setDropOn] = useState<string | null>(null);
  const onto = (slug: string) => ({
    onDragOver: (e: React.DragEvent) => {
      const p = payloadOf(e);
      if (p?.kind !== "section" || slug === current) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropOn(slug);
    },
    onDragLeave: () => setDropOn((d) => (d === slug ? null : d)),
    onDrop: (e: React.DragEvent) => {
      const p = payloadOf(e);
      setDropOn(null);
      if (p?.kind !== "section") return;
      e.preventDefault();
      endDrag();
      void b.moveToPage(p.id, slug);
    },
  });

  /** The title, or in the language the canvas shows, its word there. */
  const rename = (slug: string, title: string) => {
    const p = bySlug.get(slug);
    const lang = b.state.lang;
    if (!p) return;
    const set: PagePatch = lang ? { translations: { ...p.translations, [lang]: { ...p.translations?.[lang], title } } } : { title };
    b.apply({ kind: "page", page: slug, op: { op: "page", set } });
  };
  const move = (slug: string, to: Place) => {
    const op = moveOp(nav, slug, to);
    if (op) b.apply(op);
  };
  const siblings = (parent: string | null) => nav.filter((p) => p.parent === parent).sort(byPosition);
  const toggle = (p: NavEntry) => b.apply({ kind: "page", page: p.slug, op: { op: "page", set: { hidden: !p.hidden } } });
  const open = (slug: string) => {
    setOutline(false);
    b.open(slug);
  };

  return (
    <nav aria-label="Pages" className="flex min-w-0 flex-1 items-center gap-0.5">
      <Popover open={outline} onOpenChange={setOutline}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Every page" title="Every page">
            <IconListTree />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-1">
          <Outline
            b={b}
            rows={rowsOf(roots)}
            hidden={hidden}
            onOpen={open}
            onDetails={(slug) => (setOutline(false), setDetails(slug))}
            onToggle={toggle}
            onMove={move}
            siblings={siblings}
          />
        </PopoverContent>
      </Popover>

      <ul className="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">
        {roots.map((n) => {
          const on = top === n.slug;
          const under = rowsOf(n.children);
          const sub = on && current !== n.slug ? under.find((r) => r.n.slug === current)?.n : undefined;
          return (
            <li
              key={n.slug}
              {...onto(n.slug)}
              title={dropOn === n.slug ? `Drop to move the section to ${n.title}` : undefined}
              className={cn(
                "flex shrink-0 items-center rounded-md",
                on ? "bg-muted text-foreground" : "text-muted-foreground",
                dropOn === n.slug && "ring-primary bg-primary/10 ring-2",
              )}
            >
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
                  aria-current={current === n.slug ? "page" : undefined}
                  title="Double-click to rename"
                  onClick={() => b.open(n.slug)}
                  onDoubleClick={() => setRenaming(n.slug)}
                  className={cn(
                    "hover:text-foreground focus-visible:ring-ring/50 flex h-7 items-center gap-1 rounded-md px-2.5 text-sm outline-none focus-visible:ring-2",
                    hidden.has(n.slug) && "opacity-60",
                  )}
                >
                  {n.number && <span className="text-muted-foreground font-mono text-xs tabular-nums">{n.number}</span>}
                  {n.title}
                  {bySlug.get(n.slug)?.hidden && <HiddenMark className="size-3.5" />}
                </button>
              )}
              {under.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Pages under ${n.title}`}
                      className="hover:text-foreground focus-visible:ring-ring/50 -ms-1 flex h-7 items-center gap-1 rounded-md px-1.5 text-sm outline-none focus-visible:ring-2"
                    >
                      {sub && <span className="text-foreground max-w-40 truncate">/ {sub.title}</span>}
                      <IconChevronDown className="size-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="app-tokens max-h-96 min-w-48">
                    {under.map(({ n: c, depth }) => (
                      <DropdownMenuItem
                        key={c.slug}
                        onSelect={() => b.open(c.slug)}
                        aria-current={current === c.slug ? "page" : undefined}
                        className={cn(current === c.slug && "bg-muted font-medium", hidden.has(c.slug) && "text-muted-foreground")}
                        style={{ paddingInlineStart: `${0.5 + depth * 0.875}rem` }}
                      >
                        {c.number && <span className="text-muted-foreground font-mono text-xs tabular-nums">{c.number}</span>}
                        <span className="truncate">{c.title}</span>
                        {bySlug.get(c.slug)?.hidden && <HiddenMark className="ms-auto" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          );
        })}
      </ul>

      <AddPage b={b} />

      {details && bySlug.has(details) && <Details key={details} b={b} entry={bySlug.get(details)!} onClose={() => setDetails(null)} />}
    </nav>
  );
}

/** A page kept from readers: the eye, and words for a screen reader. */
const HiddenMark = ({ className }: { className?: string }) => (
  <>
    <IconEyeOff aria-hidden className={className} />
    <span className="sr-only">(hidden)</span>
  </>
);

/** A tab's title, typed in place: Enter or leaving keeps it, Esc puts it back. */
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
      className="bg-background focus-visible:ring-ring/50 h-7 w-40 rounded-md px-2.5 text-sm outline-none focus-visible:ring-2"
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
  onOpen,
  onDetails,
  onToggle,
  onMove,
  siblings,
}: {
  b: BuilderApi;
  rows: Row[];
  hidden: Set<string>;
  onOpen: (slug: string) => void;
  onDetails: (slug: string) => void;
  onToggle: (p: NavEntry) => void;
  onMove: (slug: string, to: Place) => void;
  siblings: (parent: string | null) => NavEntry[];
}) {
  const nav = b.state.nav;
  const entry = (slug: string) => nav.find((p) => p.slug === slug)!;
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ slug: string; zone: "before" | "into" | "after" } | null>(null);
  const [held, setHeld] = useState<string | null>(null);
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
    onMove(slug, to);
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-move="${slug}"]`)?.focus();
      moving.current = false;
    });
  };

  const drop = (target: string, zone: "before" | "into" | "after") => {
    if (!drag || within(target, drag)) return;
    const t = entry(target);
    if (zone === "into") return onMove(drag, { parent: t.slug, i: Infinity });
    const i = siblings(t.parent)
      .filter((p) => p.slug !== drag)
      .indexOf(t);
    onMove(drag, { parent: t.parent, i: zone === "before" ? i : i + 1 });
  };

  return (
    <div className="grid gap-1">
      <ul aria-label="Every page" aria-describedby={hint} className="grid max-h-[60vh] gap-px overflow-y-auto">
        {rows.map(({ n, depth }) => {
          const p = entry(n.slug);
          const kids = nav.some((q) => q.parent === n.slug);
          const zone = over?.slug === n.slug ? over.zone : null;
          return (
            <li
              key={n.slug}
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
                if (!drag || within(n.slug, drag)) return over && setOver(null);
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                const y = (e.clientY - r.top) / r.height;
                const z = y < 0.25 ? "before" : y > 0.75 ? "after" : "into";
                if (zone !== z) setOver({ slug: n.slug, zone: z });
              }}
              onDrop={(e) => {
                e.preventDefault();
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
                n.slug === b.state.selection.page && zone !== "into" && "bg-muted",
              )}
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
                  "text-muted-foreground focus-visible:ring-ring/50 flex size-5 shrink-0 cursor-grab items-center justify-center rounded-sm outline-none focus-visible:ring-2",
                  held === n.slug && "bg-primary text-primary-foreground",
                )}
              >
                <IconGripVertical aria-hidden className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => onOpen(n.slug)}
                aria-current={n.slug === b.state.selection.page ? "page" : undefined}
                className={cn(
                  "focus-visible:ring-ring/50 flex min-w-0 flex-1 items-center gap-1.5 rounded-sm py-1 text-start text-sm outline-none focus-visible:ring-2",
                  hidden.has(n.slug) && "text-muted-foreground",
                )}
              >
                {n.number && <span className="text-muted-foreground font-mono text-xs tabular-nums">{n.number}</span>}
                <span className="truncate">{n.title}</span>
              </button>
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
                  <Button variant="ghost" size="icon-xs" aria-label={`More for ${n.title}`}>
                    <IconDots />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="app-tokens">
                  <DropdownMenuItem onSelect={() => onDetails(n.slug)}>
                    <IconAdjustmentsHorizontal /> Details
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
      <p id={hint} className="text-muted-foreground border-t px-2 pt-1.5 pb-1 text-xs">
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

/** A page's own settings: title, address (a rename keeps the old one working), layout, who reads it on portals, tabs. */
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
          <DialogTitle>Page details</DialogTitle>
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
