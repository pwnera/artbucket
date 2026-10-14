"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * Brand import's word to the rest of the app (Intelligence's GET /brand-import?signal=1): how many imports are at work,
 * how many plans wait for whoever may apply them, how many stopped, and the newest at work. The sidebar's Brands badge
 * and the Brands page's banner read it; one request serves both, asked again every few seconds while something runs,
 * every minute otherwise, less often while the tab is hidden. Only where the server offers brand import, which it does
 * only where Intelligence is on (me.brandImport).
 */
export type ImportSignal = {
  running: number;
  waiting: number;
  stopped: number;
  latest: {
    id: string;
    filename: string;
    status: string;
    label: string | null;
    progress: { done: number; total: number } | null;
  } | null;
};

let base: string | null = null;
let current: ImportSignal | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let asking = false;
const listeners = new Set<() => void>();

async function ask() {
  if (!base || asking) return;
  asking = true;
  if (timer) clearTimeout(timer);
  timer = null;
  const res = await fetch(`${base}?signal=1`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  asking = false;
  if (res?.data) {
    current = res.data as ImportSignal;
    for (const l of listeners) l();
  }
  if (!listeners.size) return;
  const busy = (current?.running ?? 0) > 0;
  const seen =
    typeof document === "undefined" || document.visibilityState === "visible";
  timer = setTimeout(
    () => void ask(),
    seen ? (busy ? 5_000 : 60_000) : 120_000,
  );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

/** Asked again now: an import just started, was applied or undone. */
export function refreshImportSignal() {
  void ask();
}

/** The signal for `url` (me.brandImport), or null while it loads and where there is none. */
export function useImportSignal(url: string | null): ImportSignal | null {
  const value = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  useEffect(() => {
    if (!url) return;
    if (url !== base) {
      base = url;
      current = null;
    }
    if (!timer) void ask();
  }, [url]);
  return url ? value : null;
}

/** "1 import in progress, 2 plans waiting for review": what the badge's hint says. */
export function signalHint(s: ImportSignal | null) {
  if (!s) return undefined;
  const parts = [
    s.running &&
      `${s.running} ${s.running === 1 ? "import" : "imports"} in progress`,
    s.waiting &&
      `${s.waiting} ${s.waiting === 1 ? "plan" : "plans"} waiting for review`,
    s.stopped && `${s.stopped} stopped`,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}
