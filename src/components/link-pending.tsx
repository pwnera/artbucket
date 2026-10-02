"use client";

import { useLinkStatus } from "next/link";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/**
 * A link's icon, or a spinner in its place while the page it leads to is on
 * the way: the click shows it was heard, in the same box, so nothing moves.
 * Only inside a next/link (useLinkStatus).
 */
export function LinkIcon({ icon }: { icon: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return pending ? <Spinner aria-hidden /> : icon;
}

/** For a link without an icon (a tab): a small spinner at its end while its page is on the way. */
export function LinkSpinner({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  return pending ? <Spinner aria-hidden className={cn("text-muted-foreground size-3 shrink-0", className)} /> : null;
}

/**
 * A link that leaves the app (to connect an integration): its icon spins from
 * the click until the next page takes over, and stops if Back brings the page
 * back from the browser's cache.
 */
export function LeavingLink({ icon, children, onClick, ...props }: React.ComponentProps<"a"> & { icon: React.ReactNode }) {
  const [going, setGoing] = useState(false);
  useEffect(() => {
    const back = (e: PageTransitionEvent) => e.persisted && setGoing(false);
    window.addEventListener("pageshow", back);
    return () => window.removeEventListener("pageshow", back);
  }, []);
  return (
    <a
      {...props}
      aria-busy={going || undefined}
      onClick={(e) => {
        onClick?.(e);
        // A new tab or window leaves this page where it is.
        if (!e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) setGoing(true);
      }}
    >
      {going ? <Spinner aria-hidden /> : icon}
      {children}
    </a>
  );
}
