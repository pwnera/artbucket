"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { BuilderApi } from "@/components/builder/use-builder";
import type { SnapRule } from "@/lib/history";
import { canon, parseSections, type Section, type SnapPage, TEMPLATE_INFO } from "@/lib/pages";

/**
 * What the page on show changed since the brand's last publish, section by
 * section, for the canvas and the layers to mark while b.changes is on:
 * `new` (not in the publish), `changed` (its words, settings or items differ),
 * `rule` (the same, but a rule it shows has another value now), and the
 * sections the publish had that are gone. The publish is read once per
 * version (GET .../versions, then .../versions/{n}); a page the publish
 * didn't have is new whole. Sections compare as parsed (lib/pages.ts
 * parseSections, then canon), so a key order or a default filled in is no
 * change.
 */
export type SectionChange = "new" | "changed" | "rule";
export type Changes = {
  /** The publish compared with; null before the first one. */
  since: number | null;
  bySection: Map<string, SectionChange>;
  removed: string[];
  loading: boolean;
  error: string | null;
};

type Snapshot = { rules: SnapRule[]; pages: SnapPage[] | null };
type Version = { number: number; publishedAt: string | null };
type Published = { number: number; snap: Snapshot } | { number: null } | { error: string };

export const ChangesContext = createContext<Changes | null>(null);
/** The changes the canvas is marking, when it is. */
export const useChanges = () => useContext(ChangesContext);

/** Parsed as the builder holds sections, then as one comparable string. */
const same = (s: Section) => canon(parseSections([s]).sections[0] ?? s);

/** The page's changes since the last publish while `on`; null while off. */
export function usePublishedChanges(b: BuilderApi, on: boolean): Changes | null {
  const [published, setPublished] = useState<Published | null>(null);
  const brand = b.brand;
  const transport = b.transport;
  // A publish since (the status says readers see the latest) is a new one to compare with.
  const stamp = b.status?.publish ?? "";

  useEffect(() => {
    if (!on) return;
    let gone = false;
    const base = `/api/v1/brands/${encodeURIComponent(brand)}/versions`;
    void (async (): Promise<Published> => {
      const list = await transport("GET", base);
      if (!list.ok) return { error: list.network ? "Couldn't reach the server." : (list.error?.message ?? "Couldn't read the history.") };
      const last = (list.data as Version[]).find((v) => v.publishedAt);
      if (!last) return { number: null };
      const got = await transport("GET", `${base}/${last.number}`);
      if (!got.ok) return { error: "Couldn't read the last release." };
      return { number: last.number, snap: got.data as Snapshot };
    })().then((p) => !gone && setPublished(p));
    return () => {
      gone = true;
    };
  }, [on, brand, transport, stamp]);

  const slug = b.state.selection.page;
  const sections = b.state.pages.get(slug);
  const rules = b.state.rules;
  return useMemo((): Changes | null => {
    if (!on) return null;
    const none = { bySection: new Map<string, SectionChange>(), removed: [] };
    if (!published) return { since: null, ...none, loading: true, error: null };
    if ("error" in published) return { since: null, ...none, loading: false, error: published.error };
    const bySection = new Map<string, SectionChange>();
    if (published.number === null) {
      for (const s of sections ?? []) bySection.set(s.id, "new");
      return { since: null, bySection, removed: [], loading: false, error: null };
    }
    const snap = published.snap;
    const was = snap.pages?.find((p) => p.slug === slug || p.aliases?.includes(slug));
    const before = new Map((was?.sections ?? []).map((s) => [s.id, s]));
    // Rules whose default value or spec differs from the publish: a section showing one reads differently.
    const said = (r: { value: unknown; usage?: string | null; spec?: unknown; label?: string | null }) => canon([r.value, r.usage ?? null, r.spec ?? null, r.label ?? null]);
    const then = new Map(snap.rules.filter((r) => r.context === null).map((r) => [r.key, said(r)]));
    const moved = new Set(rules.filter((r) => r.context === null && then.get(r.key) !== said(r)).map((r) => r.key));
    for (const s of sections ?? []) {
      const old = before.get(s.id);
      if (!old) bySection.set(s.id, "new");
      else if (same(old) !== same(s)) bySection.set(s.id, "changed");
      else if (s.keys.some((k) => moved.has(k))) bySection.set(s.id, "rule");
    }
    const now = new Set((sections ?? []).map((s) => s.id));
    const removed = (was?.sections ?? []).filter((s) => !now.has(s.id)).map((s) => s.title || TEMPLATE_INFO[s.template]?.name || s.template);
    return { since: published.number, bySection, removed, loading: false, error: null };
  }, [on, published, sections, rules, slug]);
}

/** How each change reads on its badge. */
export const CHANGE_LABEL: Record<SectionChange, string> = { new: "New", changed: "Changed", rule: "Rule changed" };
