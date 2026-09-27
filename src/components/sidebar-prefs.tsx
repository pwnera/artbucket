"use client";

import { useState, useSyncExternalStore } from "react";
import { IconArrowDown, IconArrowUp, IconChevronRight, IconDots } from "@tabler/icons-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from "@/components/ui/sidebar";
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
const RECENTS = "artbucket:recents";

/** Note that something was opened: it goes to the top of Recents. */
export function remember(r: Omit<Recent, "at">) {
  const list = read<Recent[]>(RECENTS) ?? [];
  const rest = list.filter((x) => !(x.kind === r.kind && x.id === r.id));
  writePref(RECENTS, [{ ...r, at: Date.now() }, ...rest].slice(0, 8));
}

export const useRecents = () => usePref<Recent[]>(RECENTS, []);

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

/** The default order; a person's own order wins. Saved searches last: the rest are places, they are queries. */
export const SECTIONS = ["recents", "collections", "brands", "searches"] as const;
export type SectionId = (typeof SECTIONS)[number];

export const useSections = () => useSortable("sections", [...SECTIONS], (s) => s);
export const useFolded = () => usePref<string[]>("artbucket:folded", []);

/**
 * A sidebar section, PostHog style: a small-caps label that folds it, an add
 * action, and a menu to move the section or do something to all of it. The
 * label is also its drag handle.
 */
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
  const closed = folded.includes(id);
  return (
    <SidebarGroup {...s.target} className={cn("relative py-0.5", !closed && "pb-2", s.dragging && "opacity-50")}>
      <DropLine line={s.line} />
      <div className="group/section relative flex items-center">
        <SidebarGroupLabel asChild className="h-7 flex-1 cursor-pointer pr-14 tracking-wide uppercase group-data-[collapsible=icon]:-mt-7">
          <button
            type="button"
            {...s.handle}
            onClick={() => setFolded(closed ? folded.filter((f) => f !== id) : [...folded, id])}
            aria-expanded={!closed}
            title="Click to fold, drag to move"
          >
            <IconChevronRight className={cn("mr-1 !size-3 transition-transform", !closed && "rotate-90")} />
            {label}
          </button>
        </SidebarGroupLabel>
        <div className="absolute right-2 flex items-center gap-0.5 group-data-[collapsible=icon]:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`${label} section menu`}
                className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex size-5 items-center justify-center rounded-md opacity-0 transition-opacity group-hover/section:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
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
        </div>
      </div>
      {!closed && <SidebarGroupContent>{children}</SidebarGroupContent>}
    </SidebarGroup>
  );
}

/** The add button in a section's header, e.g. "New collection". */
export function SectionAdd({ label, onClick, icon }: { label: string; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex size-5 items-center justify-center rounded-md [&>svg]:size-4"
    >
      {icon}
      <span className="sr-only">{label}</span>
    </button>
  );
}
