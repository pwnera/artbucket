"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { IconChevronDown, IconX } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * A panel that floats over the canvas, as a design tool's color picker or
 * inspector does: never modal, so the page under it stays clickable. Its
 * header drags it (kept inside the window), a double click on it or the
 * chevron folds it to its header, and Esc closes it unless a field in it
 * has the focus (the field's own Esc comes first). Where it was left and
 * whether it was folded are kept per `id` in this browser, so it opens
 * there again; until it is moved, it opens beside `anchor`.
 *
 * It is portalled to the body, so a zoomed or transformed canvas never
 * shifts it, and draws in the app's colors (.app-tokens).
 *
 * Props:
 * - id: what its place is remembered by.
 * - title: its header's words; `icon` before them, `actions` after.
 * - anchor: what it opens beside, until it has been moved.
 * - width: in px.
 * - onClose: the X, or Esc.
 * - label: its name for a screen reader, when `title` isn't plain words.
 */
export type FloatingPanelProps = {
  id: string;
  title: React.ReactNode;
  label?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  anchor?: HTMLElement | null;
  width?: number;
  onClose(): void;
  children: React.ReactNode;
  className?: string;
};

type Kept = { x?: number; y?: number; folded?: boolean };

const GAP = 12;
const key = (id: string) => `floating-panel:${id}`;

function read(id: string): Kept {
  try {
    return JSON.parse(localStorage.getItem(key(id)) ?? "{}") as Kept;
  } catch {
    return {};
  }
}

function keep(id: string, k: Kept) {
  try {
    localStorage.setItem(key(id), JSON.stringify(k));
  } catch {
    // Private mode or storage full: it opens beside its anchor next time.
  }
}

/** Kept inside the window, with its header always reachable. */
function clamp(x: number, y: number, w: number) {
  return {
    x: Math.max(GAP, Math.min(x, window.innerWidth - w - GAP)),
    y: Math.max(GAP, Math.min(y, window.innerHeight - 48)),
  };
}

/** Beside the anchor: on its end side when there is room, else under it, else at the window's end. */
function besideOf(anchor: HTMLElement | null | undefined, w: number) {
  if (!anchor?.isConnected) return clamp(window.innerWidth - w - GAP * 2, 64, w);
  const r = anchor.getBoundingClientRect();
  if (r.right + GAP + w <= window.innerWidth - GAP) return clamp(r.right + GAP, r.top, w);
  if (r.left - GAP - w >= GAP) return clamp(r.left - GAP - w, r.top, w);
  return clamp(r.left, r.bottom + GAP, w);
}

const FIELD = "input, textarea, select, [contenteditable]:not([contenteditable=false])";
const never = () => () => {};

export function FloatingPanel({ id, title, label, icon, actions, anchor, width = 384, onClose, children, className }: FloatingPanelProps) {
  const client = useSyncExternalStore(
    never,
    () => true,
    () => false,
  );
  const [kept] = useState(() => (typeof window === "undefined" ? {} : read(id)));
  const [folded, setFolded] = useState(!!kept.folded);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const moved = useRef(kept.x !== undefined);
  const box = useRef<HTMLDivElement>(null);

  // Where it opens: where it was left, else beside the anchor; again beside a new anchor until it has been moved.
  useLayoutEffect(() => {
    if (!moved.current) setAt(besideOf(anchor, width));
    else setAt((p) => p ?? clamp(kept.x ?? 0, kept.y ?? 0, width));
  }, [anchor, width, kept.x, kept.y]);

  // A smaller window keeps it in view.
  useEffect(() => {
    const onResize = () => setAt((p) => p && clamp(p.x, p.y, width));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [width]);

  const fold = useCallback(
    (to: boolean) => {
      setFolded(to);
      keep(id, { ...read(id), folded: to });
    },
    [id],
  );

  const drag = (e: React.PointerEvent<HTMLElement>) => {
    // A header takes no focus of its own: the panel takes it, so Esc closes it from there too.
    if (!box.current?.contains(document.activeElement)) box.current?.focus({ preventScroll: true });
    if (e.button !== 0 || (e.target as Element).closest("button, a, input, select, textarea") || !at) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const from = { x: e.clientX - at.x, y: e.clientY - at.y };
    let last = at;
    const move = (ev: PointerEvent) => {
      last = clamp(ev.clientX - from.x, ev.clientY - from.y, width);
      setAt(last);
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      if (last === at) return;
      moved.current = true;
      keep(id, { ...read(id), ...last });
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  if (!client || !at) return null;
  return createPortal(
    <div
      ref={box}
      role="dialog"
      aria-modal={false}
      tabIndex={-1}
      aria-label={label ?? (typeof title === "string" ? title : undefined)}
      style={{ left: at.x, top: at.y, width }}
      className={cn(
        "app-tokens bg-popover text-popover-foreground animate-in fade-in-0 zoom-in-95 fixed z-50 flex flex-col overflow-hidden rounded-xl border font-sans shadow-2xl outline-none",
        className,
      )}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || e.defaultPrevented) return;
        // A field's own Esc puts back what is saved; the next one closes.
        if ((document.activeElement as Element | null)?.matches(FIELD) && box.current?.contains(document.activeElement)) return;
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      <header
        className="bg-muted/40 flex h-10 shrink-0 cursor-grab touch-none items-center gap-1 border-b ps-3 pe-1 select-none active:cursor-grabbing"
        onPointerDown={drag}
        onDoubleClick={(e) => !(e.target as Element).closest("button") && fold(!folded)}
        title="Drag to move. Double click to fold."
      >
        {icon && <span className="text-muted-foreground flex shrink-0 [&_svg]:size-4">{icon}</span>}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
        {actions}
        <button
          type="button"
          aria-label={folded ? "Unfold" : "Fold"}
          aria-expanded={!folded}
          title={folded ? "Unfold" : "Fold"}
          onClick={() => fold(!folded)}
          className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 flex size-7 items-center justify-center rounded-md outline-none focus-visible:ring-2"
        >
          <IconChevronDown className={cn("size-4 transition-transform duration-200", folded && "-rotate-90")} />
        </button>
        <button
          type="button"
          aria-label="Close"
          title="Close (Esc)"
          onClick={onClose}
          className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 flex size-7 items-center justify-center rounded-md outline-none focus-visible:ring-2"
        >
          <IconX className="size-4" />
        </button>
      </header>
      {/* Folds by height, both ways, and keeps what is in it. */}
      <div className={cn("grid min-h-0 transition-[grid-template-rows] duration-200", folded ? "grid-rows-[0fr]" : "grid-rows-[1fr]")} inert={folded}>
        <div className="min-h-0 overflow-y-auto overscroll-contain" style={{ maxHeight: `calc(100dvh - ${at.y + 40 + GAP}px)` }}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
