"use client";

import { createElement, useEffect, useState } from "react";
import { IconHash } from "@tabler/icons-react";
import { CopyButton } from "@/components/copy-button";
import { behavior, flash } from "@/lib/motion";
import { cn } from "@/lib/utils";

export { behavior };

/**
 * Getting around a page by its anchors: scrolling to one, linking to it,
 * knowing which one is being read, and the flash where a link lands. The
 * editor and the site both move this way.
 */

/** Where a single key is typing, or a dialog's or menu's own: the page's keys stay out of it. */
export const TYPING =
  "input, textarea, select, [contenteditable]:not([contenteditable=false]), [role=dialog], [role=alertdialog], [role=menu], [role=listbox], [role=combobox]";

/** Scrolls to `id` and puts it in the address bar, with no jump and no history entry. */
export function goTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: behavior() });
  window.history.replaceState(null, "", `#${id}`);
}

/** The link to `id` on this page, for someone else: the brand and context stay in it. */
const linkTo = (id: string) => `${location.origin}${location.pathname}${location.search}#${id}`;

/**
 * Which of `ids` is being read: the last whose top has passed 30% of the
 * window, the last one once the page is scrolled to its end (a short one
 * never gets that far up), and none above the first, on the cover.
 */
export function useActiveSection(ids: string[]) {
  const [active, setActive] = useState<string | null>(null);
  // One string, so a new array of the same ids doesn't start over. An id never holds a space.
  const order = ids.join(" ");
  useEffect(() => {
    const ns = order ? order.split(" ") : [];
    let frame = 0;
    const measure = () => {
      frame = 0;
      let at: string | null = null;
      for (const id of ns) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top < innerHeight * 0.3) at = id;
      }
      const end = scrollY > 0 && innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
      setActive(end && at ? ns.at(-1)! : at);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [order]);
  return active;
}

/** Arriving at an anchor (a shared link, ⌘K, Back), it flashes once, then fades. */
export function useHashFlash() {
  useEffect(() => {
    const onHash = () => {
      const el = location.hash.length > 1 && document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (el) flash(el);
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
}

/** "#" beside a heading, for everyone: copies a link to it (the check where you clicked) and puts it in the address bar. */
export function AnchorLink({ id, label, className }: { id: string; label: string; className?: string }) {
  // No JSX in a .ts module: the one element, made by hand.
  return createElement(CopyButton, {
    icon: IconHash,
    label,
    what: "link",
    className: cn("opacity-0 transition-opacity focus-visible:opacity-100", className),
    text: async () => {
      window.history.replaceState(null, "", `#${id}`);
      return linkTo(id);
    },
  });
}
