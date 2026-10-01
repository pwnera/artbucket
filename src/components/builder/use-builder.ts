"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { checkWarnings, deriveTheme, type ThemeSettings } from "@/lib/brand-theme";
import {
  apply,
  applyAll,
  type BuilderState,
  echo,
  type EchoPage,
  EMPTY,
  fieldOf,
  type History,
  homeOf,
  type Init,
  initState,
  invert,
  load,
  navOf,
  type Op,
  pageOf,
  push,
  pushStep,
  request,
  shownOn,
  targetOf,
  travel,
} from "@/lib/builder-ops";
import { useSource, useStatus } from "@/components/builder/use-status";
import { useComments } from "@/components/builder/comments";
import { usePref } from "@/components/sidebar-prefs";
import { boundKeys, canon, type Section } from "@/lib/pages";
import { sendResult, type Sent } from "@/lib/send";
import type { Media, PageView } from "@/lib/site";
import { behavior, collapse, flash } from "@/lib/motion";
import { undoable } from "@/lib/undo";

/** A section's block on the canvas (seam.tsx BLOCK), if drawn. */
const blockOf = (id: string) => document.querySelector(`[data-canvas-block="${CSS.escape(id)}"]`);

/**
 * The builder's state in React (lib/builder-ops.ts holds the logic): every
 * change an op, applied at once, undoable, and sent in order. Writes go out
 * one request at a time, consecutive ops to one target together (a page's
 * as one PATCH of ops, rules as one set_rules batch, theme patches as one),
 * because order matters across targets: a rule is made before a section
 * binds it. Saving, Saved and Not saved come from lib/saving.ts through
 * send(); a dropped connection holds the queue with a Retry, and a refusal
 * says why and offers a reload. Deleting a section or a page gives the 8 s
 * Undo toast (lib/undo.ts).
 */

/** How the builder reaches the API: fetch through lib/send.ts in the app; the dev page records writes in memory instead. */
export type Transport = (method: string, url: string, body?: unknown) => Promise<Sent>;
const network: Transport = (method, url, body) => sendResult(method, url, body, { quiet: true });

/** The sheet or dialog open over the canvas: the top bar opens them, the builder draws them, a deep link can too. */
export type Panel = "rules" | "history" | "tokens" | "publish" | null;

/** The panel docked beside the canvas, which never covers it: the picked section's settings, blocks and rules to drag in, or the theme, so the page re-themes in view. */
export type Dock = "section" | "insert" | "theme" | "comments" | null;

/** What a copied section is on the clipboard: JSON under this key, so a paste knows it from any other text. */
export const CLIP = "artbucket/section";

/** A section as the clipboard carries it, and back: null for text that isn't one. */
export const clip = (s: Section) => JSON.stringify({ [CLIP]: s });
export function unclip(text: string): Record<string, unknown> | null {
  try {
    const x = JSON.parse(text)?.[CLIP];
    return x && typeof x === "object" && typeof x.template === "string" ? x : null;
  } catch {
    return null;
  }
}

const SAVE = "builder-save";
/** Where the page list's open or closed is remembered. */
const PAGES = "artbucket:builder-pages";
const FLOAT = "artbucket:builder-panel-float";

/** The last section copied from a menu, for a paste the clipboard won't give back (permission refused). */
let copied: string | null = null;

export function useBuilder(brand: string, init: Init, transport: Transport = network) {
  const [state, setState] = useState(() => initState(init));
  const [depth, setDepth] = useState({ past: 0, future: 0 });
  // What work outliving a render reads (an answer, a toast's Undo, a Retry): always the latest.
  const live = useRef({ state, history: EMPTY as History, brand, transport, queue: [] as Op[], flying: false, stalled: false });
  useEffect(() => {
    live.current.brand = brand;
    live.current.transport = transport;
  });
  // The transport under one identity for the builder's life, since reads key their effects on it:
  // a production build inlines `network` into the default above, a new function each render.
  const send = useCallback<Transport>((method, url, body) => live.current.transport(method, url, body), []);
  const [panel, setPanel] = useState<Panel>(null);
  const [dock, setDock] = useState<Dock>(null);
  // The item the section panel sets up, by its section and index: a right click's "Item settings".
  const [item, setItem] = useState<{ section: string; i: number } | null>(null);
  // Sections picked besides the one selected, with Shift or Cmd (b.pick), for changes to all of them at once.
  const [also, setAlso] = useState<string[]>([]);
  // The library floating over the canvas (library-panel.tsx), to drag assets onto the page.
  const [library, setLibrary] = useState(false);
  // Review comments on the brand's pages (comments.tsx): counts on sections, threads in the panel.
  const comments = useComments(brand, send);
  // The comments panel shows the whole page's threads rather than the picked section's.
  const [commentsOnPage, setCommentsOnPage] = useState(false);
  // Marking what changed since the last publish on the canvas (changes.tsx).
  const [changes, setChanges] = useState(false);
  // The page list beside the canvas: open unless the person closed it in this browser.
  const [pagesOpen, setPagesOpen] = usePref(PAGES, true);
  // The panel (b.dock) floats over the canvas instead of beside it: kept in this browser, as the page list's is.
  const [floating, setFloating] = usePref(FLOAT, false);
  // The page whose settings are open, by slug: the page list's menu and the bar's title open them.
  const [pageSettings, setPageSettings] = useState<string | null>(null);
  const { status, refresh: refreshStatus } = useStatus(brand, send);
  // The repository the brand is kept in too (brand as code), for the bar's sync state.
  const source = useSource(brand, send);

  // Leaving with a write not yet landed asks first.
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (live.current.queue.length) e.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, []);

  // Stable across renders: they read the latest state from `live`, so a toolbar or a key handler can hold them.
  const act = useMemo(() => {
    const commit = (s: BuilderState) => {
      live.current.state = s;
      setState(s);
    };
    const remember = (h: History) => {
      live.current.history = h;
      setDepth({ past: h.past.length, future: h.future.length });
    };
    const send = (ops: Op[]) => {
      live.current.queue.push(...ops);
      void flush();
    };

    /** The next request, then the next, until nothing waits; held after a dropped connection until Retry. */
    async function flush() {
      const l = live.current;
      if (l.flying || l.stalled) return;
      const r = request(l.queue, l.brand);
      if (!r) return;
      l.flying = true;
      const res = await l.transport(r.method, r.url, r.body);
      l.flying = false;
      if (res.ok) {
        const [sent] = l.queue.splice(0, r.take);
        toast.dismiss(SAVE);
        // The server's copy, unless a newer edit to it is still waiting: that one's answer brings it.
        const later = new Set(l.queue.map(targetOf));
        const data = res.data as { page?: EchoPage; settings?: ThemeSettings } | null;
        if (data?.page && !later.has(`page:${data.page.slug}`)) commit(echo(l.state, data.page));
        if (sent.kind === "theme" && data?.settings && !later.has("theme") && canon(data.settings) !== canon(l.state.theme)) {
          commit({ ...l.state, theme: data.settings });
        }
      } else if (res.network) {
        l.stalled = true;
        toast.error("Couldn't save your last change", {
          id: SAVE,
          duration: Infinity,
          description: "It is still on the page.",
          action: {
            label: "Retry",
            onClick: () => {
              live.current.stalled = false;
              void flush();
            },
          },
        });
        return;
      } else {
        l.queue.splice(0, r.take);
        // The server said no to what the canvas shows, so the canvas and its history no longer match it.
        // ponytail: a reload; roll back just the refused ops if refusals turn out common.
        remember(EMPTY);
        if (res.status !== 401) {
          toast.error(res.error?.message ?? "Couldn't save that", {
            id: SAVE,
            duration: Infinity,
            description: "The page shows a change the server didn't keep.",
            action: { label: "Reload", onClick: () => location.reload() },
          });
        }
      }
      void flush();
    }

    /**
     * Make a change: applied, recorded for undo, sent. Returns the op as
     * applied (an added section's id is in it), or null when it doesn't
     * apply, with a toast saying why. To show why inline instead, try
     * builder-ops apply() on `state` first.
     */
    /**
     * Rings the sections `ops` added, moved or (`all`) changed once they are
     * drawn, the first scrolled into view. Typing never gets here.
     */
    function ring(ops: Op[], all = false) {
      const ids = ops.flatMap((o) =>
        o.kind !== "page" ? [] : o.op.op === "add" ? [o.op.section.id] : o.op.op === "move" || (all && "id" in o.op) ? [o.op.id] : [],
      );
      if (!ids.length) return;
      requestAnimationFrame(() => {
        const els = ids.flatMap((id) => (id ? [...document.querySelectorAll<HTMLElement>(`[data-canvas-block="${CSS.escape(id)}"]`)] : []));
        els[0]?.scrollIntoView({ block: "nearest", behavior: behavior() });
        els.forEach(flash);
      });
    }

    function change(op: Op): Op | null {
      const l = live.current;
      const r = apply(l.state, op);
      if (r.errors.length) {
        toast.error(r.errors[0], { duration: 10_000 });
        return null;
      }
      remember(push(l.history, r.op, invert(r.op, l.state), fieldOf(r.op, l.state), Date.now()));
      commit(r.state);
      send([r.op]);
      ring([r.op]);
      return r.op;
    }

    /** Several ops as one change and one undo step: all apply, or none, with a toast saying why. */
    function changeAll(ops: Op[]): Op[] | null {
      const l = live.current;
      const r = applyAll(l.state, ops);
      if (r.errors.length) {
        toast.error(r.errors[0], { duration: 10_000 });
        return null;
      }
      remember(pushStep(l.history, { redo: r.done, undo: r.undo, field: null, at: Date.now() }));
      commit(r.state);
      send(r.done);
      ring(r.done);
      return r.done;
    }

    /** A section put in after `after` on `page` (the page on show when left out), picked. Its id is made unless it's free there. */
    function insert(section: Record<string, unknown>, after: string | null, page = current()): string | null {
      const copy = { ...section };
      if (sectionsOf(page).some((x) => x.id === copy.id)) delete copy.id;
      const done = change({ kind: "page", page, op: { op: "add", section: copy as never, after } });
      if (done?.kind !== "page" || done.op.op !== "add") return null;
      if (page === current()) select({ section: done.op.section.id!, rule: null });
      return done.op.section.id!;
    }

    function travelTo(back: boolean) {
      const l = live.current;
      const t = travel(l.state, l.history, back);
      if (t.errors.length) toast.error(`Couldn't ${back ? "undo" : "redo"} that: ${t.errors[0]}`, { duration: 10_000 });
      commit(t.state);
      remember(t.history);
      send(t.sent);
      // The section it changed comes into view and lights up: an undo far down the page is seen.
      ring(t.sent, true);
    }

    const select = (to: Partial<BuilderState["selection"]>) => {
      const s = live.current.state;
      // Another section, or another page: the ones picked with it let go.
      if ((to.section !== undefined && to.section !== s.selection.section) || (to.page !== undefined && to.page !== s.selection.page)) setAlso([]);
      commit({ ...s, selection: { ...s.selection, ...to } });
    };

    /** A page's sections and media, fetched once; true when they are at hand. */
    async function fetchPage(slug: string): Promise<boolean> {
      const l = live.current;
      if (l.state.pages.has(slug)) return true;
      const q = new URLSearchParams({ page: slug, edit: "1" });
      const res = await l.transport("GET", `/api/v1/brands/${encodeURIComponent(l.brand)}/view?${q}`);
      if (!res.ok) {
        toast.error(`Couldn't open ${slug}`, { duration: 10_000 });
        return false;
      }
      commit(load(live.current.state, res.data as PageView));
      return true;
    }

    const current = () => live.current.state.selection.page;
    const sectionsOf = (page: string) => live.current.state.pages.get(page) ?? [];

    return {
      apply: change,
      applyAll: changeAll,
      insert,
      undo: () => travelTo(true),
      redo: () => travelTo(false),
      select,
      /**
       * Pick a section, as a design tool picks a layer: alone, or with `add`
       * (Shift or Cmd) added to the ones picked, or taken out of them again.
       * The first one picked stays the selection, which the panel sets up.
       */
      pick(id: string, o: { add?: boolean } = {}) {
        const primary = live.current.state.selection.section;
        if (!o.add || !primary) return select({ section: id, rule: null });
        if (id === primary) return;
        setAlso((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
      },
      /** Let go of every section picked but the selection. */
      unpickOthers: () => setAlso([]),
      /** Show a page, loading it first when it isn't yet (the canvas shows `page` null meanwhile). */
      open(slug: string) {
        select({ page: slug, section: null, rule: null });
        void fetchPage(slug);
      },
      setContext: (context: string | null) => commit({ ...live.current.state, context }),
      setPreview: (preview: boolean) => commit({ ...live.current.state, preview }),
      setLang: (lang: string | null) => commit({ ...live.current.state, lang }),
      /** Assets just picked or uploaded, so the canvas draws them before the page is loaded again. */
      addMedia(media: Media[]) {
        const s = live.current.state;
        commit({ ...s, base: { ...s.base, media: { ...s.base.media, ...Object.fromEntries(media.map((m) => [m.id, m])) } } });
      },
      /** Delete a section of the page on show, with the 8 s Undo. */
      removeSection(id: string) {
        const page = current();
        // It folds away first, so the sections below close the gap instead of jumping.
        collapse(blockOf(id), () => {
          const before = live.current.state;
          const done = change({ kind: "page", page, op: { op: "remove", id } });
          if (!done) return;
          const back = invert(done, before);
          undoable("Section deleted", {
            // Cmd+Z may have brought it back already.
            undo: () => (sectionsOf(page).some((x) => x.id === id) ? false : change(back) ?? Promise.reject()),
          });
        });
      },
      /** Delete several sections of the page on show at once: one step to undo, and one toast's Undo. */
      removeSections(ids: string[]) {
        const page = current();
        collapse(
          ids.flatMap((id) => blockOf(id) ?? []),
          () => {
            const ops: Op[] = ids.map((id) => ({ kind: "page", page, op: { op: "remove", id } }));
            const back = applyAll(live.current.state, ops).undo;
            if (!changeAll(ops)) return;
            select({ section: null, rule: null });
            undoable(ids.length === 1 ? "Section deleted" : `${ids.length} sections deleted`, {
              undo: () => (ids.some((id) => sectionsOf(page).some((x) => x.id === id)) ? false : (changeAll(back) ?? Promise.reject())),
            });
          },
        );
      },
      /** A copy of a section, just under it, selected. */
      duplicate(id: string) {
        const x = sectionsOf(current()).find((y) => y.id === id);
        if (!x) return;
        const copy: Record<string, unknown> = { ...x };
        delete copy.id;
        insert(copy, id);
      },
      /** A section of the page on show, as the clipboard carries it. */
      clipOf(id: string): string | null {
        const x = sectionsOf(current()).find((y) => y.id === id);
        return x ? clip(x) : null;
      },
      /** Copy a section from a menu: to the clipboard, and kept here for a browser that won't read it back. */
      copy(id: string) {
        const text = clip(sectionsOf(current()).find((y) => y.id === id)!);
        copied = text;
        navigator.clipboard?.writeText(text).catch(() => {});
        toast.success("Section copied", { description: "Paste it on any page of any brand." });
      },
      /** Paste from a menu: the clipboard's section, else the last one copied here, after `after`. */
      async paste(after: string | null) {
        const text = await navigator.clipboard?.readText().catch(() => null);
        const x = (text && unclip(text)) ?? (copied ? unclip(copied) : null);
        if (!x) return void toast.error("Nothing to paste", { description: "Copy a section first: right click it, or ⌘C." });
        insert(x, after);
      },
      /** A section of the page on show onto another page, last there, as one undo step. Its page is loaded first. */
      async moveToPage(id: string, to: string) {
        const from = current();
        const x = sectionsOf(from).find((y) => y.id === id);
        if (!x || to === from || !(await fetchPage(to))) return;
        const there = sectionsOf(to);
        const section: Record<string, unknown> = { ...x };
        if (there.some((y) => y.id === id)) delete section.id;
        const done = changeAll([
          { kind: "page", page: from, op: { op: "remove", id } },
          { kind: "page", page: to, op: { op: "add", section: section as never, after: there.at(-1)?.id ?? null } },
        ]);
        if (!done) return;
        const title = live.current.state.nav.find((p) => p.slug === to)?.title ?? to;
        toast.success(`Moved to ${title}`, { action: { label: "Open", onClick: () => live.current.state.nav.some((p) => p.slug === to) && select({ page: to, section: null, rule: null }) } });
      },
      /** Move a section one place up (-1) or down (1): Alt+Up and Alt+Down. */
      nudge(id: string, by: -1 | 1) {
        const page = current();
        const list = sectionsOf(page);
        const i = list.findIndex((y) => y.id === id);
        const j = i + by;
        if (i < 0 || j < 0 || j >= list.length) return;
        change({ kind: "page", page, op: { op: "move", id, after: by < 0 ? (j > 0 ? list[j - 1].id : null) : list[j].id } });
      },
      /** Delete a page with no pages under it, with the 8 s Undo. It is loaded first: its undo puts its sections back. */
      async deletePage(slug: string) {
        if (!(await fetchPage(slug))) return;
        const before = live.current.state;
        const done = change({ kind: "delete-page", page: slug });
        if (!done) return;
        const back = invert(done, before);
        undoable(`Deleted ${before.nav.find((p) => p.slug === slug)?.title ?? slug}`, {
          undo: () => (live.current.state.nav.some((p) => p.slug === slug) ? false : change(back) ?? Promise.reject()),
        });
      },
    };
  }, []);

  // The page on show as the site draws it: the canvas hands this to SiteProvider.
  const home = homeOf(state.nav, state.pages);
  const nav = useMemo(() => navOf(state.nav, home, state.lang), [state.nav, home, state.lang]);
  const slug = state.selection.page;
  const entry = state.nav.find((p) => p.slug === slug);
  const sections = state.pages.get(slug);
  const page = useMemo(() => (entry && sections ? pageOf(entry, sections, home === slug, state.lang) : null), [entry, sections, home, slug, state.lang]);
  const theme = useMemo(() => ({ ...deriveTheme(state.rules, state.theme), settings: state.theme }), [state.rules, state.theme]);
  const primary = state.selection.section;
  const picked = useMemo(
    () => (primary ? [primary, ...also.filter((id) => id !== primary && sections?.some((x) => x.id === id))] : []),
    [primary, also, sections],
  );
  const view = useMemo((): PageView => {
    const keys = new Set(state.rules.map((r) => r.key));
    return {
      ...state.base,
      lang: state.lang ?? state.base.lang,
      context: state.context,
      contexts: [...new Set(state.rules.flatMap((r) => r.context ?? []))].sort(),
      theme,
      nav,
      page,
      locked: false,
      rules: state.rules,
      warnings: checkWarnings(theme.checks),
      missing: page ? [...new Set(page.sections.flatMap(boundKeys))].filter((k) => !keys.has(k)) : [],
    };
  }, [state.base, state.lang, state.context, state.rules, theme, nav, page]);

  return {
    brand,
    state,
    /** The page on show, ready for SiteProvider (mode "edit"); `view.page` is null while it loads. */
    view,
    canUndo: depth.past > 0,
    canRedo: depth.future > 0,
    panel,
    setPanel,
    dock,
    setDock,
    item,
    setItem,
    /** Every section picked on the page, the selection first: more than one after Shift or Cmd clicks (pick). */
    picked,
    /** Whether the library panel floats over the canvas. */
    library,
    setLibrary,
    /** The brand's review comments, and whether the panel shows the page's rather than the picked section's. */
    comments,
    commentsOnPage,
    setCommentsOnPage,
    /** Whether the canvas marks what changed since the last publish. */
    changes,
    setChanges,
    /** Whether the page list shows beside the canvas. */
    pagesOpen,
    setPagesOpen,
    /** Whether the panel floats over the canvas (floating-panel.tsx) rather than docking beside it. */
    floating,
    setFloating,
    pageSettings,
    setPageSettings,
    /** The launch checklist and whether readers see the latest (use-status.ts); null until read. */
    status,
    refreshStatus,
    source,
    /** The pages that show a rule, for a rule card's "Shown on". */
    shownOn: (key: string) => shownOn(state, key),
    /** For requests of the parts' own (publish, versions, asset search), so the dev page records them too. One identity, safe in an effect's deps. */
    transport: send,
    ...act,
  };
}

/** What the builder's parts are handed: the hook's state, the page as the site draws it, and every way to change it. */
export type BuilderApi = ReturnType<typeof useBuilder>;
