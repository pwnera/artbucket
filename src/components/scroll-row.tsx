"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const FADE = "1.5rem";

/**
 * A row of tabs that scrolls sideways when narrow (TabNav's): the current
 * tab (aria-current) is brought into view, and an edge with more tabs past
 * it fades out, so a phone shows there is more to scroll to. `current`
 * changes as the tab does, for a row that stays while its pages change.
 */
export function ScrollRow({ label, current, className, children }: { label: string; current?: string; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [more, setMore] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const tab = el.querySelector<HTMLElement>('[aria-current="page"]');
    if (tab) {
      // Centered when it was out of view, by the row's own scroll: scrollIntoView would move the page too.
      const box = el.getBoundingClientRect();
      const at = tab.getBoundingClientRect();
      if (at.left < box.left || at.right > box.right) el.scrollLeft += at.left - box.left - (box.width - at.width) / 2;
    }
    const read = () => {
      const box = el.getBoundingClientRect();
      const first = el.firstElementChild?.getBoundingClientRect();
      const last = el.lastElementChild?.getBoundingClientRect();
      // By where the end tabs sit, so it reads the same right to left.
      setMore({ left: !!first && first.left < box.left - 1, right: !!last && last.right > box.right + 1 });
    };
    read();
    el.addEventListener("scroll", read, { passive: true });
    const seen = new ResizeObserver(read);
    seen.observe(el);
    return () => {
      el.removeEventListener("scroll", read);
      seen.disconnect();
    };
  }, [current]);

  const mask =
    more.left || more.right
      ? `linear-gradient(to right, ${more.left ? "transparent" : "black"}, black ${FADE}, black calc(100% - ${FADE}), ${more.right ? "transparent" : "black"})`
      : undefined;
  return (
    <nav ref={ref} aria-label={label} className={cn("overflow-x-auto [scrollbar-width:none]", className)} style={{ maskImage: mask }}>
      {children}
    </nav>
  );
}
