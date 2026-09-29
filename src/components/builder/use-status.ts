"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Transport } from "@/components/builder/use-builder";
import type { StepId } from "@/lib/readiness";
import { IDLE, snapshot, subscribe } from "@/lib/saving";

/** GET /api/v1/brands/{slug}/status, as the builder reads it (lib/core/brand-status.ts). */
export type Status = {
  steps: { id: StepId; title: string; done: boolean | null; detail: string }[];
  done: number;
  total: number;
  next: StepId | null;
  publish: "never" | "behind" | "current";
  portals: { slug: string; name: string; url: string }[] | null;
};

/**
 * The brand's launch checklist, read on arrival and again once each save
 * lands (lib/saving.ts goes back to nothing in flight), so the Publish button
 * and the checklist keep up with the edits without polling. null until read,
 * and where the server can't answer (the dev page).
 */
export function useStatus(brand: string, transport: Transport) {
  const [status, setStatus] = useState<Status | null>(null);
  const saving = useSyncExternalStore(subscribe, snapshot, () => IDLE).inFlight > 0;
  const was = useRef(saving);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const n = ++seq.current;
    const res = await transport("GET", `/api/v1/brands/${encodeURIComponent(brand)}/status`);
    // A later read has been asked for: its answer is the newer one.
    if (n !== seq.current) return;
    setStatus(res.ok ? (res.data as Status) : null);
  }, [brand, transport]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // A save just landed: a beat later, so edits in a burst are read once.
  useEffect(() => {
    const landed = was.current && !saving;
    was.current = saving;
    if (!landed) return;
    const t = setTimeout(() => void refresh(), 600);
    return () => clearTimeout(t);
  }, [saving, refresh]);

  return { status, refresh };
}
