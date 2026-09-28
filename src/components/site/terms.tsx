"use client";

import { useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/brand-values";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** A download: a link that saves (a rendition under its name) or asks the server for the file (`?download`). */
const DOWNLOAD = "a[download], a[href*='?download'], a[href*='&download']";

/** A short name for the words, so new terms ask again. */
function hash(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

/**
 * A portal's terms, before a reader's first download: one capture-phase
 * listener on the document (menus and the lightbox render outside the site)
 * holds a click on a download until they accept, then lets it go. Accepting
 * is kept under terms:{portal}:{hash} in localStorage when it may be used,
 * else for as long as the page is open.
 * ponytail: a convenience, not a boundary: bytes are signed per asset. Keep
 * acceptance server-side when a customer needs proof.
 */
export function TermsGate({ portal, terms }: { portal: string; terms: string }) {
  const key = `terms:${portal}:${hash(terms)}`;
  const [held, setHeld] = useState<HTMLAnchorElement | null>(null);
  const accepted = useRef<string | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = e.target instanceof Element ? e.target.closest(DOWNLOAD) : null;
      if (!(a instanceof HTMLAnchorElement) || accepted.current === key) return;
      try {
        if (localStorage.getItem(key)) return void (accepted.current = key);
      } catch {}
      e.preventDefault();
      e.stopPropagation();
      setHeld(a);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [key]);

  const accept = () => {
    accepted.current = key;
    try {
      localStorage.setItem(key, new Date().toISOString());
    } catch {}
    if (!held) return;
    // The download it held, let go: a copy, since the menu that showed the link may have closed.
    const again = document.createElement("a");
    again.href = held.href;
    if (held.hasAttribute("download")) again.download = held.download;
    document.body.append(again);
    again.click();
    again.remove();
  };

  return (
    <AlertDialog open={!!held} onOpenChange={(o) => !o && setHeld(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Before you download</AlertDialogTitle>
          <AlertDialogDescription>Accept the terms of use once, and your downloads start.</AlertDialogDescription>
        </AlertDialogHeader>
        {/* Long terms scroll; the region takes focus so a keyboard can scroll it too. */}
        <div role="region" aria-label="Terms of use" tabIndex={0} className="focus-visible:ring-ring/50 max-h-[50svh] overflow-y-auto rounded-md border p-3 outline-none focus-visible:ring-2">
          <Markdown text={terms} className="text-sm" />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={accept}>Accept and download</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
