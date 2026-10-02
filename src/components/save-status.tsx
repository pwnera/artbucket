"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { IconCheck } from "@tabler/icons-react";
import { Spinner } from "@/components/ui/spinner";
import { IDLE, snapshot, subscribe } from "@/lib/saving";
import { cn } from "@/lib/utils";

/**
 * Whether leaving a field saved it: Saving while a write is in flight, then
 * Saved for a moment, or Not saved until a later write lands. Idle, it shows
 * `fallback` ("Edited 2m ago"), so it can sit in that slot.
 */
export function SaveStatus({ fallback = null, className }: { fallback?: React.ReactNode; className?: string }) {
  const { inFlight, failedAt, savedAt } = useSyncExternalStore(subscribe, snapshot, () => IDLE);
  // The store is the tab's: what a write on another page left there is not this one's to report.
  const [base] = useState(snapshot);
  // The Saved that has faded: its timestamp, so the next save shows again.
  const [faded, setFaded] = useState(base.savedAt);
  useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(() => setFaded(savedAt), 2000);
    return () => clearTimeout(t);
  }, [savedAt]);

  const shown = inFlight ? (
    // Only a write that takes a while says so: a quick one goes straight to Saved, without a flicker.
    <span className="animate-in fade-in-0 fill-mode-backwards flex items-center gap-1 delay-300">
      <Spinner className="size-3" /> Saving
    </span>
  ) : failedAt && failedAt !== base.failedAt ? (
    <span className="text-destructive">Not saved</span>
  ) : savedAt && savedAt !== faded ? (
    // Fades after 1.5s; reduced motion keeps the delay, so it still reads first.
    <span key={savedAt} className="animate-out fade-out-0 fill-mode-forwards flex items-center gap-1 delay-1500 duration-500">
      <IconCheck className="size-3" /> Saved
    </span>
  ) : null;

  return (
    <span aria-live="polite" className={cn("text-muted-foreground flex items-center gap-1 text-xs", className)}>
      {shown ?? fallback}
    </span>
  );
}
