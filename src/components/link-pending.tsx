"use client";

import { useLinkStatus } from "next/link";
import { IconLoader2 } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

/**
 * A link's icon, or a spinner in its place while the page it leads to is on
 * the way: the click shows it was heard, in the same box, so nothing moves.
 * Only inside a next/link (useLinkStatus).
 */
export function LinkIcon({ icon }: { icon: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return pending ? <IconLoader2 aria-hidden className="animate-spin" /> : icon;
}

/** For a link without an icon (a tab): a small spinner at its end while its page is on the way. */
export function LinkSpinner({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  return pending ? <IconLoader2 aria-hidden className={cn("text-muted-foreground size-3 shrink-0 animate-spin", className)} /> : null;
}
