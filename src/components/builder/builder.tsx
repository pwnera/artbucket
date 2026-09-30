"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { History } from "@/components/brand-history";
import { BrandSetup } from "@/components/builder/brand-setup";
import { Canvas } from "@/components/builder/canvas";
import { builderCommands } from "@/components/builder/commands";
import { reveal } from "@/components/builder/layers";
import { PageSettings } from "@/components/builder/page-tree";
import { PublishDialog } from "@/components/builder/publish-dialog";
import { RulesSheet } from "@/components/builder/rules-sheet";
import { SectionPanel } from "@/components/builder/section-panel";
import { TopBar } from "@/components/builder/top-bar";
import { type Panel, type Transport, unclip, useBuilder } from "@/components/builder/use-builder";
import { usePageCommands, useSqueeze } from "@/components/shell";
import { behavior, TYPING } from "@/components/site/anchors";
import { SiteView } from "@/components/site/site-view";
import { TokensDialog } from "@/components/tokens-dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { duplicateItem, type Init, moveItem, removeItem } from "@/lib/builder-ops";
import { hiddenSlugs, type Section } from "@/lib/pages";
import { firstBinding, guidelinesPath, legacyAnchor, neighbors, tree } from "@/lib/site";

/**
 * The brand builder (build spec 3.5, W6.7): canvas first, the page as readers
 * see it, in the brand's theme. /brands/{slug}/guidelines renders it keyed by brand slug, and
 * /design/builder on fixtures. It lays out TopBar over Canvas (the page list
 * beside it) and draws the panel b.panel names and the page settings
 * b.pageSettings opens; a brand with no pages gets BrandSetup instead; it owns the keys (SHORTCUTS in components/shortcuts.tsx)
 * and the address: the page on show is `?page=`, and a v1 link
 * (#rule-{key}, #section-{name}) lands where lib/site.ts legacyAnchor says.
 * A phone gets the reader, with "Edit on a larger screen".
 *
 * Props:
 * - brand: the brand's slug, which the API paths name.
 * - init: what the route loaded (GET .../pages as NavEntry[] without the
 *   section count, GET .../view?page=&edit=1, GET /brand/rules as ViewRule[],
 *   the theme settings); lib/builder-ops.ts initState takes it. A new one
 *   (the route rendered again: a link, ⌘K, Back) says which page to show.
 * - transport: left out, fetch; the dev page records writes in memory.
 * - header: the host's bar over the reader on a phone (the app's AppHeader).
 * - panel: a panel to open on arrival (`?panel=`, from a brand's tabs).
 */
export type BuilderProps = {
  brand: string;
  init: Init;
  transport?: Transport;
  header?: React.ReactNode;
  panel?: Panel;
};

export function Builder(props: BuilderProps) {
  // A brand with no pages starts from its essentials, then the builder opens on the pages they make.
  return props.init.nav.length ? <Editor {...props} /> : <BrandSetup {...props} />;
}

/** A field's own undo comes first (as lib/undo.ts has it). */
const FIELD = "input, textarea, select, [contenteditable]:not([contenteditable=false])";

function Editor({ brand, init, transport, header, panel: asked }: BuilderProps) {
  const b = useBuilder(brand, init, transport);
  const mobile = useIsMobile();
  // The canvas and its panels want the room: the app's sidebar folds to its rail while editing, as it does for the reader.
  useSqueeze(!mobile);
  const root = useRef<HTMLDivElement>(null);
  // What keys, links and answers read after a render: always the latest.
  const live = useRef(b);
  useEffect(() => {
    live.current = b;
  });
  // Arriving from a brand's tab (Tokens and rules, Releases): its panel, open, and the address back to the page alone.
  useEffect(() => {
    if (!asked) return;
    live.current.setPanel(asked);
    const q = new URLSearchParams(location.search);
    q.delete("panel");
    window.history.replaceState(null, "", `?${q}${location.hash}`);
  }, [asked]);
  // ⌘K offers the builder's own commands first, read from the builder as it is when the palette opens.
  usePageCommands(useCallback(() => builderCommands(live.current), []));

  /** A section into view. The canvas prefixes ids (SiteProvider idPrefix), so the id is matched at the end. */
  const show = useCallback((id: string) => {
    root.current?.querySelector(`section[data-template][id$="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: behavior() });
  }, []);

  // A v1 link, waiting for its page to load before its section is picked.
  const landing = useRef<{ page: string; key: string | null } | null>(null);
  /** Lands a v1 link: false when the hash isn't one, or lands nowhere. */
  const land = useCallback((hash: string) => {
    if (!/^#(rule|section)-./.test(hash)) return false;
    const b = live.current;
    const { nav, pages } = b.state;
    // A page not loaded yet stands in by the keys its row lists; its section is found once it loads.
    const at = legacyAnchor(
      b.view.nav,
      nav.map((p) => ({ slug: p.slug, sections: pages.get(p.slug) ?? [{ keys: p.keys } as Section] })),
      hash,
    );
    let key: string | null = null;
    if (hash.startsWith("#rule-")) {
      key = hash.slice("#rule-".length);
      try {
        key = decodeURIComponent(key);
      } catch {
        // A stray % in a pasted link: read it as written.
      }
    }
    if (at) {
      b.open(at.page);
      landing.current = { page: at.page, key };
      return true;
    }
    // A rule no page shows: the list view has it.
    if (key && b.state.rules.some((r) => r.key === key)) {
      b.select({ rule: key });
      b.setPanel("rules");
      return true;
    }
    return false;
  }, []);

  // Arriving, and each time the route renders again (a link, ⌘K, Back): a v1 link lands, else the page the address asks for shows.
  useEffect(() => {
    if (land(location.hash)) return;
    const page = init.view.page?.slug;
    if (page && page !== live.current.state.selection.page) live.current.open(page);
  }, [init, land]);

  // A link on the page itself (#rule-{key}), or one ⌘K moved to.
  useEffect(() => {
    const onHash = () => land(location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [land]);

  // Once the landing page is at hand: its section binding the key, picked and in view.
  useEffect(() => {
    const l = landing.current;
    const sections = l && b.state.pages.get(l.page);
    if (!l || !sections) return;
    landing.current = null;
    const section = (l.key && firstBinding(sections, l.key)) || null;
    b.select({ section, rule: l.key });
    if (section) show(section);
  });

  // The address names the page on show, so a reload or a copied link opens it; switching pages adds no history.
  const slug = b.state.selection.page;
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (!slug || q.get("page") === slug) return;
    q.set("page", slug);
    window.history.replaceState(null, "", `?${q}`);
  }, [slug]);

  // The keys (components/shortcuts.tsx lists them). Never while typing or in a dialog; ⌘Z not in a field.
  const afterG = useRef(0);
  useEffect(() => {
    if (mobile) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const b = live.current;
      const t = e.target instanceof Element ? e.target : null;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      const id = b.state.selection.section;
      const editing = !b.state.preview;
      // The item picked in the picked section, as Figma picks a layer inside a frame: the keys act on it before its section.
      const page = b.state.selection.page;
      const section = id ? b.state.pages.get(page)?.find((s) => s.id === id) : undefined;
      const item = editing && !b.state.lang && section && b.item?.section === id && section.items?.[b.item.i] ? b.item.i : null;
      const setItems = (set: Record<string, unknown>) => b.apply({ kind: "page", page, op: { op: "update", id: id!, set } });
      if (mod && !e.altKey && key === "z") {
        if (t?.closest(FIELD)) return;
        // Prevented, so an undo toast's own ⌘Z (lib/undo.ts) doesn't undo it twice.
        e.preventDefault();
        if (e.shiftKey) b.redo();
        else b.undo();
        return;
      }
      if (e.repeat || t?.closest(TYPING)) return;
      // Previewing, the site's own keys move between its sections and pages (site-view.tsx).
      if (b.state.preview && !mod && ["j", "k", "[", "]"].includes(key)) return;
      // G then a letter goes somewhere (components/shortcuts.tsx): G T is Team, not Tokens.
      if (!mod && !e.altKey && key === "g") return void (afterG.current = Date.now());
      if (Date.now() - afterG.current < 1000) return;
      // As a design tool steps through layers: Enter goes into the picked section's items, Tab and Shift+Tab walk them, Esc comes back out.
      // Only from the section itself (or the page), so Tab still walks the buttons and fields it reaches.
      const onBlock = !t || t === document.body || t.hasAttribute("data-canvas-block");
      const n = section?.items?.length ?? 0;
      if (!mod && !e.altKey && editing && !b.state.lang && onBlock && id && n) {
        const to = e.key === "Enter" && item === null && !e.shiftKey ? 0 : e.key === "Tab" && item !== null ? (item + (e.shiftKey ? n - 1 : 1)) % n : null;
        if (to !== null) {
          e.preventDefault();
          b.setItem({ section: id, i: to });
          reveal(id, to);
          return;
        }
      }
      if (mod) {
        if (e.altKey || e.shiftKey || key !== "d" || !id || !editing) return;
        e.preventDefault();
        if (item !== null) setItems(duplicateItem(section!, item));
        else b.duplicate(id);
        return;
      }
      if (e.altKey) {
        if ((e.key !== "ArrowUp" && e.key !== "ArrowDown") || !id || !editing) return;
        e.preventDefault();
        if (item !== null) {
          const to = item + (e.key === "ArrowUp" ? -1 : 1);
          if (to < 0 || to >= section!.items!.length) return;
          setItems(moveItem(section!, item, to));
          b.setItem({ section: id, i: to });
          return;
        }
        b.nudge(id, e.key === "ArrowUp" ? -1 : 1);
        // Where it moved to, once drawn there.
        requestAnimationFrame(() => show(id));
        return;
      }
      if (e.key === "Escape") {
        if (b.state.preview) b.setPreview(false);
        // Up a level at a time: the item, the other sections picked, then the section.
        else if (b.item) b.setItem(null);
        else if (b.picked.length > 1) b.unpickOthers();
        else if (id || b.state.selection.rule) b.select({ section: null, rule: null });
        else return;
      } else if (e.key === "Backspace" || e.key === "Delete") {
        if (!id || !editing) return;
        if (item !== null) {
          setItems(removeItem(section!, item));
          b.setItem(null);
        } else if (b.picked.length > 1) b.removeSections(b.picked);
        else b.removeSection(id);
      } else if (key === "p") {
        b.setPreview(!b.state.preview);
      } else if (key === "h" || key === "t") {
        b.setPanel(key === "h" ? "history" : "tokens");
      } else if (key === "j" || key === "k") {
        // In the preview, the sections readers get.
        const list = (b.view.page?.sections ?? []).filter((s) => editing || !s.hidden);
        const at = list.findIndex((s) => s.id === id);
        const to = list[key === "j" ? at + 1 : Math.max(at - 1, 0)]?.id;
        if (!to) return;
        b.select({ section: to, rule: null });
        show(to);
      } else if (e.key === "[" || e.key === "]") {
        const to = neighbors(tree(b.view.nav, false), b.state.selection.page)[e.key === "[" ? "prev" : "next"];
        if (!to) return;
        b.open(to.slug);
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobile, show]);

  // ⌘C, ⌘X and ⌘V on the picked section, never on text: a selection or a field keeps the browser's own.
  useEffect(() => {
    if (mobile) return;
    const mine = (e: ClipboardEvent) => {
      const b = live.current;
      const t = e.target instanceof Element ? e.target : null;
      return !b.state.preview && !t?.closest(TYPING) && !t?.closest(FIELD) && !getSelection()?.toString();
    };
    const onCopy = (e: ClipboardEvent) => {
      const b = live.current;
      const id = b.state.selection.section;
      const text = id && mine(e) ? b.clipOf(id) : null;
      if (!text || !e.clipboardData) return;
      e.preventDefault();
      e.clipboardData.setData("text/plain", text);
      if (e.type === "cut") b.removeSection(id!);
      else toast.success("Section copied", { description: "Paste it on any page of any brand." });
    };
    const onPaste = (e: ClipboardEvent) => {
      const b = live.current;
      const x = mine(e) ? unclip(e.clipboardData?.getData("text/plain") ?? "") : null;
      if (!x) return;
      e.preventDefault();
      const list = b.state.pages.get(b.state.selection.page) ?? [];
      const id = b.insert(x, b.state.selection.section ?? list.at(-1)?.id ?? null);
      if (id) requestAnimationFrame(() => show(id));
    };
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCopy);
      document.removeEventListener("paste", onPaste);
    };
  }, [mobile, show]);

  // A phone reads: what readers get, hidden pages and sections left out.
  const readable = useMemo(() => {
    const gone = hiddenSlugs(b.state.nav);
    const page = b.view.page;
    return { ...b.view, nav: b.view.nav.filter((p) => !gone.has(p.slug)), page: page && { ...page, sections: page.sections.filter((s) => !s.hidden) } };
  }, [b.view, b.state.nav]);
  const href = useCallback(
    (page: string, section?: string) => `${guidelinesPath(brand, { view: "read", page })}${section ? `#${section}` : ""}`,
    [brand],
  );
  const navigate = useCallback((to: string) => {
    const u = new URL(to, location.href);
    const page = u.pathname === guidelinesPath(brand) && u.searchParams.get("page");
    if (page) live.current.open(page);
    else location.assign(to);
  }, [brand]);

  const panel = (p: Panel) => ({ open: b.panel === p, onOpenChange: (open: boolean) => b.setPanel(open ? p : null) });

  if (mobile)
    return (
      <div ref={root} className="flex min-w-0 flex-1 flex-col">
        {header}
        <p role="note" className="bg-muted text-muted-foreground border-b px-4 py-2 text-sm">
          Edit on a larger screen. Here, the pages show as readers see them.
        </p>
        <SiteView view={readable} href={href} top={header ? "top-14" : "top-0"} onNavigate={navigate} />
      </div>
    );

  // Preview is the whole site as readers will get it once published: its nav, on-this-page and pager around the page, in the draft's theme.
  // Theme stays open beside it, so a change to the nav or the page's opening shows as it is made.
  const theming = b.state.preview && b.dock === "theme";
  return (
    <div ref={root} className="flex min-w-0 flex-1 flex-col">
      <TopBar b={b} />
      {b.state.preview ? (
        <div className="flex min-w-0 flex-1">
          {/* Floating, the panel sits over the site: it keeps its own width. */}
          <Fit on={theming && !b.floating}>
            {readable.page ? (
              <SiteView view={readable} href={href} onNavigate={navigate} />
            ) : (
              <p role="status" className="text-muted-foreground px-6 py-16 text-center text-sm">
                Opening the page…
              </p>
            )}
          </Fit>
          {theming && <SectionPanel b={b} />}
        </div>
      ) : (
        <Canvas b={b} />
      )}
      <RulesSheet b={b} {...panel("rules")} />
      {/* The sheet is modal: nothing is edited while it's open, so it keeps up by fetching on open. */}
      <History brand={b.view.brand} {...panel("history")} edits={0} onRestored={() => location.reload()} />
      <TokensDialog brand={b.view.brand} context={b.state.context ?? undefined} {...panel("tokens")} />
      <PublishDialog b={b} {...panel("publish")} />
      <PageSettings b={b} />
    </div>
  );
}

/** The width the site is previewed at beside the Theme panel: past 72rem, where its nav and on-this-page take their own columns. */
const DESKTOP = 1280;

/**
 * The site at a desktop's width, scaled down to the room it has while `on`,
 * so the Theme panel beside it never folds its columns into the phone's
 * layout. The whole of it is one CSS zoom: its sticky chrome and anchors
 * still work, only smaller.
 */
function Fit({ on, children }: { on: boolean; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const el = box.current;
    if (!el || !on) return;
    const ro = new ResizeObserver(([e]) => setZoom(Math.min(1, e.contentRect.width / DESKTOP)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [on]);
  return (
    <div ref={box} className="min-w-0 flex-1">
      <div style={on && zoom < 1 ? { zoom } : undefined}>{children}</div>
    </div>
  );
}
