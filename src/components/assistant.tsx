"use client";

import { createContext, useCallback, useContext, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconSparkles } from "@/components/icons";
import { assistantPlace } from "@/lib/assistant-place";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * The server's assistant (ASSISTANT_URL, me.assistant): a page that answers
 * questions about the library, opened beside the app in a panel. The app only
 * frames it: it reads the library as the person, through the API or MCP, and
 * the app knows nothing of how.
 *
 * One conversation follows the person around: the panel opens over a page or
 * over an open asset (inside its dialog, so the dialog's focus and clicks
 * reach it), and the frame tells the app which conversation it shows
 * (postMessage { type: "artbucket:assistant", chat }), so reopening anywhere
 * carries on with it. With an asset open, the frame is told its id. The frame
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
 */

type AssistantValue = {
  url: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  /** The conversation the frame last showed: the next frame opens on it. */
  chat: string | null;
  setChat: (chat: string | null) => void;
  /** Panels an open asset holds: while there is one, the shell's own steps aside. */
  nested: number;
  setNested: React.Dispatch<React.SetStateAction<number>>;
  /** The docked panel's width, in pixels. */
  width: number;
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
  const [nested, setNested] = useState(0);
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
  const value = useMemo(
    () => (url ? { url, open, setOpen, chat, setChat, nested, setNested, width, setWidth } : null),
    [url, open, chat, setChat, nested, width, setWidth],
  );
  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

/** Where the frame opens: embedded, on the conversation so far, about the asset open. */
function frameSrc(url: string, chat: string | null, asset: string | null) {
  const u = new URL(url, window.location.href);
  u.searchParams.set("embed", "1");
  if (chat) u.searchParams.set("chat", chat);
  if (asset) u.searchParams.set("asset", asset);
  return u.toString();
}

/**
 * The panel. Rendered once by the shell for the pages, and by an open asset's
 * editor inside its dialog: `asset` is that asset's id. Not modal: the page
 * beside it stays usable, and a click on it doesn't close the panel.
 */
export function AssistantPanel({ asset }: { asset?: string }) {
  const a = useAssistant();
  const setNested = a?.setNested;
  useEffect(() => {
    if (!setNested || asset === undefined) return;
    setNested((n) => n + 1);
    return () => setNested((n) => n - 1);
  }, [setNested, asset]);
  const router = useRouter();
  const onMessage = useEffectEvent((e: MessageEvent) => {
    if (!a || e.origin !== new URL(a.url, window.location.href).origin) return;
    const data = e.data as { type?: string; chat?: unknown; close?: unknown; changed?: unknown; navigate?: unknown } | null;
    if (data?.type !== "artbucket:assistant") return;
    if (typeof data.chat === "string" || data.chat === null) a.setChat(data.chat);
    // Escape pressed inside the frame, which the panel can't hear itself.
    if (data.close === true) a.setOpen(false);
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
  // The shell's panel, while an asset's holds the conversation.
  const shown = !!a && (asset !== undefined || a.nested === 0);
  if (!a || !shown) return null;
  if (a.open && !opened) {
    setOpened(true);
    setSrc(frameSrc(a.url, a.chat, asset ?? null));
  } else if (!a.open && opened) setOpened(false);

  return (
    <Sheet open={a.open} onOpenChange={a.setOpen} modal={false}>
      <SheetContent
        side="right"
        className="w-full gap-0 p-0 shadow-none sm:max-w-none md:w-(--assistant-w)"
        onInteractOutside={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the assistant"
          aria-valuenow={a.width}
          aria-valuemin={MIN_WIDTH}
          tabIndex={0}
          title="Drag to resize"
          className="group/edge absolute inset-y-0 -left-1.5 z-10 hidden w-3 cursor-col-resize touch-none outline-none md:block"
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
              "bg-border absolute inset-y-0 left-1.5 w-px transition-colors group-hover/edge:bg-primary group-focus-visible/edge:bg-primary",
              dragging && "bg-primary",
            )}
          />
        </div>
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="flex items-center gap-1.5 text-sm">
            <IconSparkles className="text-primary-ink size-4" /> Ask
          </SheetTitle>
          <SheetDescription className="sr-only">Questions about your library, answered from what you can see; changes wait for your approval.</SheetDescription>
        </SheetHeader>
        {src && (
          <iframe key={src} src={src} title="Assistant" className={cn("min-h-0 w-full flex-1 border-0", dragging && "pointer-events-none")} allow="clipboard-write" />
        )}
      </SheetContent>
    </Sheet>
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
