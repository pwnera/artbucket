"use client";

import { createContext, useCallback, useContext, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconSparkles } from "@/components/icons";
import { assistantPlace } from "@/lib/assistant-place";
import { FocusScope } from "radix-ui/internal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The server's assistant (ASSISTANT_URL, me.assistant): a page that answers
 * questions about the library, opened beside the app in a panel. The app only
 * frames it: it reads the library as the person, through the API or MCP, and
 * the app knows nothing of how.
 *
 * One frame, never moved: the shell holds it, so the conversation stays put
 * while the person goes from page to page, and opens and closes assets (moving
 * an iframe reloads it). An open asset's dialog leaves it usable
 * (AssistantAsset) and says which asset is open; the app passes that on to the
 * frame ({ type: "artbucket:app", asset, expanded }, on each change and each
 * load). The frame tells the app which conversation it shows
 * (postMessage { type: "artbucket:assistant", chat }), so reopening anywhere
 * carries on with it. The frame
 * asks the panel to close ({ close: true }) on Escape, which only it hears, and
 * says when a change the person approved there was made ({ changed: true }), so
 * the page beside it shows it. It can also take the person somewhere
 * ({ navigate: "/path" }): the app goes only to its own pages that show
 * things (assistantPlace), never to one that acts by being opened.
 *
 * On a wide screen the panel is docked on the right and the app makes room for
 * it: its width is --assistant-w on <html> while it is open (0 otherwise),
 * which the shell and an open asset's dialog leave free. The person drags its
 * left edge to change it (or uses the arrow keys there), and the width is kept.
 * The frame draws the panel's header itself (expand, its title, history, close):
 * it asks for the whole window ({ expand: true }) and back ({ expand: false }).
 */

type AssistantValue = {
  url: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  /** The conversation the frame last showed: the next frame opens on it. */
  chat: string | null;
  setChat: (chat: string | null) => void;
  /** The asset open in the app, which "this" means in the frame. */
  asset: string | null;
  setAsset: React.Dispatch<React.SetStateAction<string | null>>;
  /** The docked panel's width, in pixels. */
  width: number;
  /** Over the whole window rather than beside the page, as the frame asked. */
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
  setWidth: (width: number, keep?: boolean) => void;
};

/** The panel's width: a usable chat at least, and room left for the app. */
const MIN_WIDTH = 320;
const DEFAULT_WIDTH = 420;
const APP_ROOM = 480;
const clampWidth = (w: number) => Math.round(Math.max(MIN_WIDTH, Math.min(w, 900, (typeof window === "undefined" ? 1440 : window.innerWidth) - APP_ROOM)));

const AssistantContext = createContext<AssistantValue | null>(null);

/** The assistant, where the server has one; null elsewhere (and on /design). */
export const useAssistant = () => useContext(AssistantContext);

export function AssistantProvider({ url, children }: { url: string | null; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  // The tab remembers the conversation across reloads, as it remembers a closed banner (components/shell.tsx).
  const [chat, setChatState] = useState<string | null>(() => {
    try {
      return typeof window === "undefined" ? null : sessionStorage.getItem("assistant:chat");
    } catch {
      return null;
    }
  });
  const setChat = useCallback((c: string | null) => {
    setChatState(c);
    try {
      if (c) sessionStorage.setItem("assistant:chat", c);
      else sessionStorage.removeItem("assistant:chat");
    } catch {}
  }, []);
  const [asset, setAsset] = useState<string | null>(null);
  // The width the person last left it at, in this browser; a narrow window only holds it back: wider again, it comes back.
  const [saved] = useState(() => {
    try {
      const w = typeof window === "undefined" ? NaN : Number(localStorage.getItem("assistant:width"));
      return Number.isFinite(w) && w > 0 ? w : DEFAULT_WIDTH;
    } catch {
      return DEFAULT_WIDTH;
    }
  });
  const [width, setWidthState] = useState(() => clampWidth(saved));
  const wanted = useRef(saved);
  const setWidth = useCallback((w: number, keep = false) => {
    const c = clampWidth(w);
    wanted.current = c;
    setWidthState(c);
    if (keep)
      try {
        localStorage.setItem("assistant:width", String(c));
      } catch {}
  }, []);
  // The room the app leaves on the right: the panel's width while it is open.
  const docked = !!url && open;
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--assistant-w", docked ? `${width}px` : "0px");
    return () => void root.removeProperty("--assistant-w");
  }, [docked, width]);
  // A window made narrower keeps room for the app.
  useEffect(() => {
    const fit = () => setWidthState(clampWidth(wanted.current));
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  const [expanded, setExpanded] = useState(false);
  // Closed, it opens beside the page again.
  if (!open && expanded) setExpanded(false);
  const value = useMemo(
    () => (url ? { url, open, setOpen, chat, setChat, asset, setAsset, width, setWidth, expanded, setExpanded } : null),
    [url, open, chat, setChat, asset, width, setWidth, expanded],
  );
  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

/** Where the frame opens: embedded, on the conversation so far, about the asset open, expanded or not. */
function frameSrc(url: string, chat: string | null, asset: string | null, expanded: boolean) {
  const u = new URL(url, window.location.href);
  u.searchParams.set("embed", "1");
  if (chat) u.searchParams.set("chat", chat);
  if (asset) u.searchParams.set("asset", asset);
  if (expanded) u.searchParams.set("expanded", "1");
  return u.toString();
}

/**
 * The panel, rendered once by the shell: a card docked on the right (over the
 * whole screen on a phone, or when expanded). Not a dialog: the page beside it
 * stays usable, and nothing on it closes the panel but its own close.
 */
export function AssistantPanel() {
  const a = useAssistant();
  const router = useRouter();
  const frame = useRef<HTMLIFrameElement>(null);
  // What the frame should know of the app: the asset open, whether the panel is expanded.
  const tellFrame = useEffectEvent(() => {
    if (!a) return;
    frame.current?.contentWindow?.postMessage({ type: "artbucket:app", asset: a.asset, expanded: a.expanded }, new URL(a.url, window.location.href).origin);
  });
  // Each page the frame loads (another conversation, a new one) hears it too.
  const [loads, setLoads] = useState(0);
  useEffect(() => tellFrame(), [a?.asset, a?.expanded, loads]);
  const onMessage = useEffectEvent((e: MessageEvent) => {
    if (!a || e.origin !== new URL(a.url, window.location.href).origin) return;
    const data = e.data as { type?: string; chat?: unknown; close?: unknown; changed?: unknown; navigate?: unknown; expand?: unknown } | null;
    if (data?.type !== "artbucket:assistant") return;
    if (typeof data.chat === "string" || data.chat === null) a.setChat(data.chat);
    // Escape pressed inside the frame, which the panel can't hear itself.
    if (data.close === true) a.setOpen(false);
    if (typeof data.expand === "boolean") a.setExpanded(data.expand);
    if (data.changed === true) router.refresh();
    const place = assistantPlace(data.navigate, window.location.origin);
    if (place) router.push(place);
  });
  useEffect(() => {
    const listen = (e: MessageEvent) => onMessage(e);
    window.addEventListener("message", listen);
    return () => window.removeEventListener("message", listen);
  }, []);
  // The frame's address is fixed when it opens: a conversation it moves to later is its own to show.
  const [src, setSrc] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  // While its edge is dragged: the frame lets the pointer through, and the app follows without easing.
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging) return;
    document.documentElement.dataset.assistantResizing = "";
    return () => void delete document.documentElement.dataset.assistantResizing;
  }, [dragging]);
  if (!a) return null;
  if (a.open && !opened) {
    setOpened(true);
    setSrc(frameSrc(a.url, a.chat, a.asset, a.expanded));
  } else if (!a.open && opened) setOpened(false);
  if (!a.open || !src) return null;

  return (
    <aside
      // Beside a modal dialog it stays usable: a click there isn't outside the dialog (ui/dialog.tsx).
      data-assistant-panel=""
      aria-label="Assistant"
      // A card beside the page, a little off the window's edges; expanded, over the whole window. Above an asset's
      // dialog on a phone, where both cover the screen; usable while one is open (pointer-events: body's are off).
      className={cn(
        "bg-popover text-popover-foreground animate-in slide-in-from-right fixed inset-0 z-[60] flex flex-col overflow-hidden duration-200 pointer-events-auto",
        "md:inset-y-2 md:right-2 md:left-auto md:z-50 md:rounded-xl md:border md:shadow-sm",
        a.expanded ? "md:left-2" : "md:w-[calc(var(--assistant-w)-0.5rem)]",
      )}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the assistant"
        aria-valuenow={a.width}
        aria-valuemin={MIN_WIDTH}
        tabIndex={0}
        title="Drag to resize"
        className={cn("group/edge absolute inset-y-0 left-0 z-10 hidden w-2 cursor-col-resize touch-none outline-none md:block", a.expanded && "md:hidden")}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
        }}
        onPointerMove={(e) => {
          if (dragging) a.setWidth(window.innerWidth - e.clientX);
        }}
        onPointerUp={(e) => {
          if (!dragging) return;
          e.currentTarget.releasePointerCapture(e.pointerId);
          setDragging(false);
          a.setWidth(window.innerWidth - e.clientX, true);
        }}
        onPointerCancel={() => setDragging(false)}
        onDoubleClick={() => a.setWidth(DEFAULT_WIDTH, true)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 80 : 20;
          if (e.key === "ArrowLeft") a.setWidth(a.width + step, true);
          else if (e.key === "ArrowRight") a.setWidth(a.width - step, true);
          else return;
          e.preventDefault();
        }}
      >
        <span
          className={cn(
            "absolute inset-y-3 left-0 w-0.5 rounded-full transition-colors group-hover/edge:bg-primary group-focus-visible/edge:bg-primary",
            dragging && "bg-primary",
          )}
        />
      </div>
      <iframe
        ref={frame}
        key={src}
        src={src}
        title="Assistant"
        className={cn("min-h-0 w-full flex-1 border-0", dragging && "pointer-events-none")}
        allow="clipboard-write"
        onLoad={() => setLoads((n) => n + 1)}
      />
    </aside>
  );
}

/**
 * Said by an open asset's dialog, inside it: which asset is open, for the
 * frame. While the panel is open beside the dialog, it also lets the panel take
 * focus: a scope of its own, mounted after the dialog's, stops that one
 * trapping focus (Radix keeps one active focus scope; the newest wins).
 */
export function AssistantAsset({ id }: { id: string }) {
  const a = useAssistant();
  const setAsset = a?.setAsset;
  useEffect(() => {
    if (!setAsset) return;
    setAsset(id);
    return () => setAsset((was) => (was === id ? null : was));
  }, [setAsset, id]);
  // After the dialog's own scope has mounted: a child's effects run before its parent's.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const f = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(f);
  }, []);
  if (!a?.open || !ready) return null;
  return (
    <FocusScope.Root trapped={false} onMountAutoFocus={(e) => e.preventDefault()} onUnmountAutoFocus={(e) => e.preventDefault()}>
      <span hidden />
    </FocusScope.Root>
  );
}

/** The way in: a button that opens the panel. Nothing where the server has no assistant. */
export function AskButton({ className, label = "Ask" }: { className?: string; label?: string }) {
  const a = useAssistant();
  if (!a) return null;
  return (
    <Button type="button" variant="outline" size="sm" className={className} onClick={() => a.setOpen(!a.open)} aria-pressed={a.open}>
      <IconSparkles className="text-primary-ink" /> {label}
    </Button>
  );
}
