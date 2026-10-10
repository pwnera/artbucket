"use client";

import { createContext, useCallback, useContext, useState, useSyncExternalStore } from "react";
import { IconArrowDown, IconArrowUp, IconChevronRight, IconDots, IconX } from "@tabler/icons-react";
import { Collapsible } from "radix-ui";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useMe } from "@/components/can";
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { applyOrder, moveTo } from "@/lib/order";
import { cn } from "@/lib/utils";

/**
 * How one person arranges their sidebar: the order of sections and of the
 * items in them, which sections are folded, and what they opened lately.
 * Preferences, not library data, so they live in this browser: another
 * person, or an agent, sees the library's own order.
 */

const EVENT = "artbucket:prefs";

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private windows and full storage: the page works, it just won't remember.
  }
  window.dispatchEvent(new Event(EVENT));
}

const subscribe = (on: () => void) => {
  window.addEventListener("storage", on);
  window.addEventListener(EVENT, on);
  return () => {
    window.removeEventListener("storage", on);
    window.removeEventListener(EVENT, on);
  };
};

/**
 * A preference, as its raw string so the snapshot is stable between reads.
 * The server has none, so the first paint is the default everywhere.
 */
export function usePref<T>(key: string, fallback: T): [T, (v: T) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null,
  );
  let value = fallback;
  if (raw !== null) {
    try {
      value = JSON.parse(raw) as T;
    } catch {}
  }
  return [value, (v: T) => writePref(key, v)];
}

// ---- recents -----------------------------------------------------------------

export type Recent = { kind: "asset" | "collection" | "search" | "brand"; id: string; label: string; href: string; at: number };
/** Recents belong to a project: what you opened in one is not what you opened in another. */
const recentsKey = (project: string | undefined) => `artbucket:recents:${project ?? "none"}`;

/** `remember(item)`: note that something was opened in this project; it goes to the top of its Recents. */
export function useRemember() {
  const project = useMe()?.project.id;
  return useCallback(
    (r: Omit<Recent, "at">) => {
      const key = recentsKey(project);
      const rest = (read<Recent[]>(key) ?? []).filter((x) => !(x.kind === r.kind && x.id === r.id));
      writePref(key, [{ ...r, at: Date.now() }, ...rest].slice(0, 8));
    },
    [project],
  );
}

export const useRecents = () => usePref<Recent[]>(recentsKey(useMe()?.project.id), []);

// ---- pinned ------------------------------------------------------------------

/** What a person starred to keep at hand: any object of the catalog, from any project of the organization. */
export type Pin = { id: string; type: "brand" | "collection" | "asset" | "portal" | "rule" | "page"; label: string; href: string };
const pinsKey = (org: string | undefined) => `artbucket:pinned:${org ?? "none"}`;

export function usePins() {
  const [pins, setPins] = usePref<Pin[]>(pinsKey(useMe()?.project.organization.id), []);
  const has = (id: string) => pins.some((p) => p.id === id);
  const toggle = (p: Pin) => setPins(has(p.id) ? pins.filter((x) => x.id !== p.id) : [...pins, p]);
  return { pins, has, toggle, unpin: (id: string) => setPins(pins.filter((x) => x.id !== id)) };
}

type Named = { id: string; name: string };

/**
 * Recents as the library is now: a deleted collection or saved search drops
 * out, and a renamed one shows its new name. Assets and brands stay as
 * noted; opening a missing asset already says so.
 */
export function liveRecents(recents: Recent[], collections: Named[], searches: Named[]) {
  const names = { collection: new Map(collections.map((c) => [c.id, c.name])), search: new Map(searches.map((s) => [s.id, s.name])) };
  return recents.flatMap((r) => {
    if (r.kind !== "collection" && r.kind !== "search") return [r];
    const name = names[r.kind].get(r.id);
    return name === undefined ? [] : [{ ...r, label: name }];
  });
}

// ---- ordering ----------------------------------------------------------------

type Line = "before" | "after";

/**
 * The drag image: a copy of what is being moved, lifted onto a floating card,
 * instead of the browser's link preview or a see-through snapshot of the row.
 */
function lift(e: React.DragEvent) {
  const from = e.currentTarget as HTMLElement;
  const box = from.getBoundingClientRect();
  const card = from.cloneNode(true) as HTMLElement;
  card.querySelectorAll("[aria-hidden], button[aria-haspopup]").forEach((el) => el.remove());
  Object.assign(card.style, {
    position: "fixed",
    top: "-1000px",
    left: "0",
    width: `${box.width}px`,
    margin: "0",
    padding: "2px 4px",
    listStyle: "none",
    opacity: "1",
    background: "var(--popover)",
    color: "var(--popover-foreground)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    boxShadow: "0 10px 30px -6px rgb(0 0 0 / 0.35)",
    pointerEvents: "none",
  });
  document.body.append(card);
  e.dataTransfer.setDragImage(card, e.clientX - box.left, e.clientY - box.top);
  // The browser takes its picture during dragstart; a timer (not a frame,
  // which a background tab never paints) then clears the copy away.
  setTimeout(() => card.remove());
}

/**
 * A list the person can reorder, by dragging or from an item's menu. The
 * returned `item(id)` goes on each row: drag props, and where the drop line is.
 */
export function useSortable<T>(list: string, items: T[], id: (t: T) => string) {
  const [order, setOrder] = usePref<string[]>(`artbucket:order:${list}`, []);
  const sorted = applyOrder(items, order, id);
  const ids = sorted.map(id);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; line: Line } | null>(null);
  const reset = () => {
    setDrag(null);
    setOver(null);
  };

  const move = (key: string, step: -1 | 1) => {
    const target = ids[ids.indexOf(key) + step];
    if (target) setOrder(moveTo(ids, key, target, step > 0));
  };

  const item = (key: string) => ({
    /** Spread on the element that is dragged. */
    handle: {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        e.stopPropagation(); // an item, not the section it is in
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", key);
        lift(e);
        setDrag(key);
      },
      onDragEnd: reset,
    },
    /** Spread on the element dropped onto. */
    target: {
      onDragOver: (e: React.DragEvent) => {
        if (!drag) return; // someone else's drag: let it bubble to the section
        e.preventDefault();
        e.stopPropagation();
        const box = e.currentTarget.getBoundingClientRect();
        const line: Line = e.clientY > box.top + box.height / 2 ? "after" : "before";
        if (over?.id !== key || over.line !== line) setOver({ id: key, line });
      },
      onDrop: (e: React.DragEvent) => {
        if (!drag) return;
        e.preventDefault();
        e.stopPropagation();
        if (over) setOrder(moveTo(ids, drag, over.id, over.line === "after"));
        reset();
      },
    },
    line: over?.id === key && drag !== key ? over.line : null,
    dragging: drag === key,
    canUp: ids.indexOf(key) > 0,
    canDown: ids.indexOf(key) < ids.length - 1,
    up: () => move(key, -1),
    down: () => move(key, 1),
  });

  return { sorted, item };
}
export type SortableItem = ReturnType<ReturnType<typeof useSortable>["item"]>;

/** Where a dragged item would land. */
export function DropLine({ line }: { line: Line | null }) {
  if (!line) return null;
  return (
    <div
      aria-hidden
      className={cn("bg-primary pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded-full", line === "before" ? "-top-px" : "-bottom-px")}
    />
  );
}

/** Move up / Move down, for an item's or a section's menu: reordering without a mouse. */
export function MoveItems({ s }: { s: SortableItem }) {
  return (
    <>
      <DropdownMenuItem disabled={!s.canUp} onSelect={s.up}>
        <IconArrowUp /> Move up
      </DropdownMenuItem>
      <DropdownMenuItem disabled={!s.canDown} onSelect={s.down}>
        <IconArrowDown /> Move down
      </DropdownMenuItem>
    </>
  );
}

// ---- sections ----------------------------------------------------------------

/**
 * The catalog, as the sidebar's tree: the project's brands, collections and
 * portals, what other projects shared into it, and saved searches last (the
 * rest are things, they are queries). A person's own order wins.
 */
export const SECTIONS = ["brands", "collections", "portals", "shared", "searches"] as const;
export type SectionId = (typeof SECTIONS)[number];

export const useSections = () => useSortable("sections", [...SECTIONS], (s) => s);
export const useFolded = () => usePref<string[]>("artbucket:folded", []);

/**
 * A Collapsible.Content that slides open and shut instead of snapping
 * (tw-animate-css keyframes). Clipped with a margin, as details folds are,
 * so the rows' focus rings aren't cut at the sides.
 */
export const FOLD = "overflow-clip [overflow-clip-margin:4px] data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down";

/**
 * A sidebar section, PostHog style: a small-caps label that folds it, an add
 * action, and a menu to move the section or do something to all of it. The
 * label is also its drag handle. Folded to the icon rail, sections leave
 * altogether: the rail is places, Settings and the account, as in Linear.
 */
/** A section shown in the panel that flies out of the folded rail: open, headed by its name, and a way to close the panel. */
export const Flyout = createContext<{ close: () => void } | null>(null);

export function SidebarSection({
  id,
  label,
  sortable: s,
  action,
  menu,
  children,
}: {
  id: SectionId;
  label: string;
  sortable: SortableItem;
  /** An add button, like "New collection". */
  action?: React.ReactNode;
  /** More items for the section's menu. */
  menu?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [folded, setFolded] = useFolded();
  const flyout = useContext(Flyout);
  // In the panel it is all there is to see: never folded.
  const closed = !flyout && folded.includes(id);
  return (
    <Collapsible.Root asChild open={!closed} onOpenChange={(o) => setFolded(o ? folded.filter((f) => f !== id) : [...folded, id])}>
      <SidebarGroup {...(!flyout && s.target)} className={cn("relative py-0.5", !flyout && "group-data-[collapsible=icon]:hidden", s.dragging && "opacity-50")}>
        {!flyout && <DropLine line={s.line} />}
        <div className={cn("group/section relative flex items-center", flyout && "h-12 border-b mb-2")}>
          {flyout ? (
            <h2 className="flex-1 truncate px-2 text-sm font-semibold">{label}</h2>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarGroupLabel asChild className="h-7 flex-1 cursor-pointer pr-14 tracking-wide uppercase">
                  <Collapsible.Trigger {...s.handle}>
                    <IconChevronRight className={cn("mr-1 !size-3 transition-transform", !closed && "rotate-90")} />
                    {label}
                  </Collapsible.Trigger>
                </SidebarGroupLabel>
              </TooltipTrigger>
              <TooltipContent side="right">Click to fold, drag to move</TooltipContent>
            </Tooltip>
          )}
          <div className={cn("flex items-center gap-0.5", flyout ? "pe-1" : "absolute right-2")}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`${label} section menu`}
                  // On touch there is no hover to reveal it, so it stays.
                  className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex size-5 items-center justify-center rounded-md transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover/section:opacity-100 pointer-fine:focus-visible:opacity-100 pointer-fine:data-[state=open]:opacity-100"
                >
                  <IconDots className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="start">
                <MoveItems s={s} />
                {menu && (
                  <>
                    <DropdownMenuSeparator />
                    {menu}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {action}
            {flyout && (
              <button
                type="button"
                onClick={flyout.close}
                aria-label="Close panel"
                className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex size-6 items-center justify-center rounded-md"
              >
                <IconX className="size-4" />
              </button>
            )}
          </div>
        </div>
        <Collapsible.Content className={FOLD}>
          {/* The gap below lives inside, so it folds with the rows instead of snapping. */}
          <SidebarGroupContent className="pb-2">{children}</SidebarGroupContent>
        </Collapsible.Content>
      </SidebarGroup>
    </Collapsible.Root>
  );
}

/** The add button in a section's header, e.g. "New collection". */
export function SectionAdd({ label, onClick, icon }: { label: string; onClick: () => void; icon: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex size-5 items-center justify-center rounded-md [&>svg]:size-4"
        >
          {icon}
          <span className="sr-only">{label}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
