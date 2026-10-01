"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A wait that checks on its own (DNS spreading, an agent's first call): a dot
 * that pulses while it looks, when it last looked, and a still dot once it
 * has stopped, so the wait never seems dead. With less motion, the dot is
 * still and the words carry it.
 */
export function Waiting({ what, checkedAt, stopped, className }: { what: string; checkedAt?: number | null; stopped?: boolean; className?: string }) {
  const now = useNow(!stopped && !!checkedAt);
  const ago = checkedAt ? Math.max(0, Math.round((now - checkedAt) / 1000)) : null;
  return (
    <p className={cn("text-muted-foreground flex items-center gap-2 text-xs", className)}>
      <span aria-hidden className="relative flex size-2 shrink-0">
        {!stopped && <span className="bg-warning absolute inline-flex size-full animate-ping rounded-full opacity-60" />}
        <span className={cn("relative inline-flex size-2 rounded-full", stopped ? "bg-muted-foreground/50" : "bg-warning")} />
      </span>
      <span>
        {what}
        {stopped ? " · stopped checking" : ago !== null && ` · checked ${ago < 60 ? `${ago}s` : `${Math.floor(ago / 60)} min`} ago`}
      </span>
    </p>
  );
}

/** The time, again every second while `on`: for "checked 12s ago". */
function useNow(on: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return now;
}
