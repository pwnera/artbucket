"use client";

import { createContext, useCallback, useContext, useEffect, useEffectEvent, useMemo, useState } from "react";
import { IconSparkles } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

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
 * asks the panel to close ({ close: true }) on Escape, which only it hears.
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
};

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
  const value = useMemo(() => (url ? { url, open, setOpen, chat, setChat, nested, setNested } : null), [url, open, chat, setChat, nested]);
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
  const onMessage = useEffectEvent((e: MessageEvent) => {
    if (!a || e.origin !== new URL(a.url, window.location.href).origin) return;
    const data = e.data as { type?: string; chat?: unknown; close?: unknown } | null;
    if (data?.type !== "artbucket:assistant") return;
    if (typeof data.chat === "string" || data.chat === null) a.setChat(data.chat);
    // Escape pressed inside the frame, which the panel can't hear itself.
    if (data.close === true) a.setOpen(false);
  });
  useEffect(() => {
    const listen = (e: MessageEvent) => onMessage(e);
    window.addEventListener("message", listen);
    return () => window.removeEventListener("message", listen);
  }, []);
  // The frame's address is fixed when it opens: a conversation it moves to later is its own to show.
  const [src, setSrc] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
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
        className="w-full gap-0 p-0 sm:max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="flex items-center gap-1.5 text-sm">
            <IconSparkles className="text-primary-ink size-4" /> Ask
          </SheetTitle>
          <SheetDescription className="sr-only">Questions about your library, answered from what you can see.</SheetDescription>
        </SheetHeader>
        {src && <iframe key={src} src={src} title="Assistant" className="min-h-0 w-full flex-1 border-0" allow="clipboard-write" />}
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
