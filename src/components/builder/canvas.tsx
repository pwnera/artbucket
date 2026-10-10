"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  IconAdjustmentsHorizontal,
  IconCopy,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconGitCompare,
  IconGripVertical,
  IconPhoto,
  IconPlus,
  IconTrash,
} from "@/components/icons";
import { toast } from "sonner";
import { SectionView } from "@/components/brand-sections";
import { useSiteLook } from "@/components/brand-sections/look";
import { asMedia as libraryMedia, upload } from "@/components/brand-sections/slots";
import { AssetPicker } from "@/components/builder/asset-picker";
import { CommentBadge, sectionKey } from "@/components/builder/comments";
import { CHANGE_LABEL, type Changes, ChangesContext, useChanges, usePublishedChanges } from "@/components/builder/changes";
import { endDrag, type Payload, payloadOf, startDrag } from "@/components/builder/drag";
import { ADD_LABEL, blankItem, PICTURED } from "@/components/builder/items";
import { RuleCard } from "@/components/builder/rule-card";
import { BLOCK, END, Seam, starter } from "@/components/builder/seam";
import { LibraryPanel } from "@/components/builder/library-panel";
import { MultiBar } from "@/components/builder/multi-bar";
import { PagesPanel } from "@/components/builder/page-tree";
import { SectionMenu } from "@/components/builder/section-menu";
import { SectionPanel } from "@/components/builder/section-panel";
import { asMedia, HANDLE, pictureFields, SectionToolbar, standIn } from "@/components/builder/section-toolbar";
import type { BuilderApi } from "@/components/builder/use-builder";
import { PageHeader } from "@/components/site/page-header";
import { type Edit, EditContext, PickedContext, SiteProvider, useSite } from "@/components/site/site-context";
import { PageTabs } from "@/components/site/tabs";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { duplicateItem, insertItems, moveItem, removeItem } from "@/lib/builder-ops";
import { boundKeys, type Item, type Section, TEMPLATE_INFO } from "@/lib/pages";
import { resolve } from "@/lib/rules";
import { groupTabs, type Media, tree, type ViewAsset } from "@/lib/site";
import { fieldsOf, withProp } from "@/lib/template-fields";
import { flash, transition } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { LATE, PageCanvasSkeleton } from "@/components/skeletons";

/** Rings item `i` of a section once it is drawn: where an added, copied or moved item went. */
export const ringItem = (section: string, i: number) => flash(`[${BLOCK}="${CSS.escape(section)}"] [data-item-root="${i}"]`);

/**
 * The page being edited (build spec 3.5.2, W6.2): PageBody of b.view.page
 * inside SiteProvider (view b.view, mode "edit") and EditContext (built from
 * b: update is a `page` op on b.state.selection.page), in the brand's theme,
 * editor chrome in `.app-tokens`. Around each section: its SectionToolbar on
 * hover or selection, a Seam between, and a right click menu (SectionMenu)
 * on it or on one of its items, and a standing way in at the page's end. The
 * page list (PagesPanel) sits before it when open. A clicked specimen opens its RuleCard,
 * floating beside it (the canvas holds which rule). The section panel (b.dock) sits
 * beside it. A width toggle of its own narrows the container to 390 or
 * 768px (D11). b.state.preview shows the page as readers see it, no chrome.
 * b.view.page is null while a page loads.
 *
 * What drops here (drag.ts): a section by its handle, between sections or
 * onto a page tab (it takes the tab); an item by its grip, among its
 * section's items; a block from the Add panel, between sections; a rule
 * from it, onto a section that takes it; pictures from the desktop, onto a
 * section of pictures (as items), one with a picture (as it), or between
 * sections (as a gallery).
 *
 * It draws the sections as PageBody does (the same SectionView, grouping and
 * context filter), each in a block that carries the chrome: PageBody has no
 * place to put it. SectionView redraws only when its section or rules change,
 * so a keystroke redraws one section, not the page.
 *
 * Props:
 * - b: the builder (use-builder.ts).
 */
export type CanvasProps = {
  b: BuilderApi;
};

/** Section ids on the canvas take this prefix, so they never clash with the app around it. */
const PREFIX = "canvas-";

/** Links drawn on the canvas. A click never leaves the builder: in preview, another page opens in it (Stage's onClick). */
const href = (page: string, section?: string) => `?page=${encodeURIComponent(page)}${section ? `#${PREFIX}${section}` : ""}`;

/** The widths the canvas previews at (D11): a container narrowed, never a frame. */
const WIDTHS = [
  [null, IconDeviceDesktop, "Full width"],
  [768, IconDeviceTablet, "Tablet, 768 px"],
  [390, IconDeviceMobile, "Phone, 390 px"],
] as const;

/** Pictures being picked for a section's items: new ones at `at`, or item `at`'s replaced; or, with `prop`, the section's own picture. */
type Pictures = { section: string; at: number; replace: boolean; prop?: string };

export function Canvas({ b }: CanvasProps) {
  const [width, setWidth] = useState<number | null>(null);
  const [card, setCard] = useState<{ page: string; key: string; anchor: HTMLElement } | null>(null);
  const { apply, select, addMedia } = b;
  const slug = b.state.selection.page;
  const { lang, preview } = b.state;

  // Stable while typing and picking, so slots don't redraw for a keystroke or a pick elsewhere.
  const edit = useMemo<Edit>(
    () => ({
      update: (id, set) => void apply({ kind: "page", page: slug, op: { op: "update", id, set } }),
      setRule: (r) => void apply({ kind: "rules", set: [r], remove: [] }),
      addMedia,
      select,
      openRule: (key, anchor) => {
        setCard({ page: slug, key, anchor });
        select({ rule: key });
      },
      lang,
    }),
    [apply, select, addMedia, slug, lang],
  );

  const changes = usePublishedChanges(b, b.changes && !preview);

  return (
    <SiteProvider view={b.view} href={href} mode={preview ? "read" : "edit"} idPrefix={PREFIX}>
      <ChangesContext.Provider value={changes}>
      <EditContext.Provider value={preview ? null : edit}>
        {/* No min-h-full here: it would override a flex item's own minimum, and the row would stop at the viewport, taking the sticky panels with it. */}
        <div className="flex min-w-0 flex-1">
          {b.pagesOpen && !preview && <PagesPanel b={b} />}
          <div className={cn("relative min-h-full min-w-0 flex-1", width && "bg-muted")}>
            <div data-vt="canvas-frame" className={cn("mx-auto min-h-full", width && "bg-background border-x shadow-sm")} style={{ maxInlineSize: width ?? undefined }}>
              {b.view.page ? (
                <>
                  <Stage b={b} />
                  {card?.page === slug && !preview && (
                    <RuleCard
                      b={b}
                      ruleKey={card.key}
                      anchor={card.anchor}
                      onClose={() => {
                        setCard(null);
                        select({ rule: null });
                      }}
                    />
                  )}
                </>
              ) : (
                // Shaped like a page, so opening one doesn't collapse the canvas to a line and back.
                <div role="status" aria-label="Opening the page" className={LATE}>
                  <PageCanvasSkeleton />
                </div>
              )}
            </div>
            {/* Stuck at the viewport's foot with no height of its own, so it adds no scroll below the page and the panels beside stay put. */}
            <div className="sticky bottom-4 z-40 h-0">
              {!preview && <MultiBar b={b} />}
              <div
                role="group"
                aria-label="Canvas width"
                className="app-tokens bg-background absolute inset-x-0 bottom-0 mx-auto flex w-fit gap-0.5 rounded-lg border p-0.5 font-sans shadow-md"
              >
                {WIDTHS.map(([w, I, label]) => (
                  <button
                    key={label}
                    type="button"
                    aria-label={label}
                    title={label}
                    aria-pressed={width === w}
                    // The page narrows or widens as one, rather than re-laying out in a frame.
                    onClick={() => transition(() => setWidth(w))}
                    className="text-muted-foreground hover:bg-accent aria-pressed:text-foreground focus-visible:ring-ring/50 relative flex size-7 items-center justify-center rounded-md outline-none focus-visible:ring-3"
                  >
                    {/* One pill, named, so it slides to the size picked. */}
                    {width === w && <span aria-hidden data-vt="width-pill" className="bg-accent absolute inset-0 rounded-md" />}
                    <I className="relative size-4" />
                  </button>
                ))}
              </div>
            </div>
          </div>
          {b.dock && !preview && <SectionPanel b={b} />}
        </div>
      </EditContext.Provider>
      </ChangesContext.Provider>
    </SiteProvider>
  );
}

/** Where a drag over a section would land: before or after it, or into it. */
type Over = { id: string; mode: "before" | "after" | "into" };
/** Where an item would land among its section's items, and where to draw the line, relative to its block. */
type ItemOver = { section: string; i: number; after: boolean; across: boolean; box: Box };
type Box = { x: number; y: number; w: number; h: number };

/** A box of `el` relative to `to`. */
function boxOf(el: Element, to: Element): Box {
  const r = el.getBoundingClientRect();
  const o = to.getBoundingClientRect();
  return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height };
}

/** Typing in a field: a right click there is the browser's (spelling, paste). */
const FIELD = "input, textarea, [contenteditable]:not([contenteditable=false])";

/** Pictures from the desktop, as the library takes them. */
const pictureFiles = (e: React.DragEvent) => [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));

/** A section that takes a picture as a prop (cover, header, split, annotated): dropped pictures set it. */
const imageProp = (s: Section) => fieldsOf(s.template).some((f) => f.kind === "asset" && f.name === "image");

/** The page in the brand's look: its header, then its sections, each in a Block. */
function Stage({ b }: { b: BuilderApi }) {
  const { view, context, url } = useSite();
  const look = useSiteLook();
  const changes = useChanges();
  const page = view.page!;
  const { preview } = b.state;
  const { page: slug, section: selected } = b.state.selection;
  const [hover, setHover] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [over, setOver] = useState<Over | null>(null);
  const [overTab, setOverTab] = useState<string | null>(null);
  const [itemOver, setItemOver] = useState<ItemOver | null>(null);
  const [grip, setGrip] = useState<{ section: string; i: number; box: Box } | null>(null);
  const [menu, setMenu] = useState<{ id: string; item: number | null } | null>(null);
  const [native, setNative] = useState(false);
  const [pictures, setPictures] = useState<Pictures | null>(null);
  // The picked item (b.item, in the picked section) where it is drawn, for its ring and its bar.
  const [chosen, setChosen] = useState<{ section: string; i: number; box: Box } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const adding = useRef(false);
  const onPictures = (section: string, at: number, replace: boolean) => setPictures({ section, at, replace });
  // What an upload's end reads: the builder as it is then, not as it was at the drop.
  const live = useRef(b);
  useEffect(() => {
    live.current = b;
  });

  // Measured after each render, and again as it or its section changes size (words typed, a picture loaded).
  const item = !preview && b.item?.section === selected ? b.item : null;
  const itemSection = item?.section;
  const itemAt = item?.i;
  useLayoutEffect(() => {
    const block = itemSection && stage.current?.querySelector(`[${BLOCK}="${CSS.escape(itemSection)}"]`);
    const el = block && block.querySelector(`[data-item-root="${itemAt}"]`);
    const measure = () => {
      const next = block && el ? { section: itemSection, i: itemAt!, box: boxOf(el, block) } : null;
      setChosen((c) => (JSON.stringify(c) === JSON.stringify(next) ? c : next));
    };
    measure();
    if (!block || !el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(block);
    return () => ro.disconnect();
  }, [itemSection, itemAt, page.sections]);

  const roots = useMemo(() => tree(view.nav, view.theme.numbering), [view.nav, view.theme.numbering]);
  // As PageBody: one resolution for the page, so each section gets the same rule objects every time and its memo holds.
  const byKey = useMemo(() => new Map(resolve(view.rules, context ?? "").map((r) => [r.key, r])), [view.rules, context]);
  const shown = useMemo(
    () => page.sections.filter((s) => (!s.only || (s.only === "default" ? null : s.only) === context) && !(preview && s.hidden)),
    [page.sections, context, preview],
  );
  const { before, tabs, after } = useMemo(() => groupTabs(shown), [shown]);
  const stored = b.state.pages.get(slug) ?? [];
  const storedOf = (id: string) => stored.find((x) => x.id === id);
  const pages = b.state.nav.map((p) => p.slug);

  const clear = () => {
    setOver(null);
    setOverTab(null);
    setItemOver(null);
    setMoving(null);
  };

  /** Where `p` would land on section `s`, with the pointer at `y` in its box; null where it can't. */
  const modeFor = (p: Payload, s: Section, e: React.DragEvent): Over["mode"] | null => {
    const r = e.currentTarget.getBoundingClientRect();
    const half = e.clientY < r.top + r.height / 2 ? "before" : "after";
    if (p.kind === "section" || p.kind === "template") return half;
    if (p.kind === "rule") {
      const rule = b.state.rules.find((x) => x.key === p.key);
      return rule && !s.keys.includes(p.key) && TEMPLATE_INFO[s.template].accepts?.(rule) ? "into" : null;
    }
    if (p.kind === "files" || p.kind === "assets") return blankItem(s, b.state.rules, pages)?.kind === "asset" || imageProp(s) ? "into" : half;
    return null;
  };

  /** Pictures from the desktop into the library, then onto the page where they were dropped. */
  const dropFiles = async (files: File[], target: Over | null) => {
    if (!files.length) return void toast.error("Only pictures and videos go on the page");
    const id = toast.loading(files.length === 1 ? `Uploading ${files[0].name}` : `Uploading ${files.length} files`);
    const done = await Promise.allSettled(files.map(upload));
    const assets = done.flatMap((x) => (x.status === "fulfilled" ? [x.value] : []));
    const failed = done.find((x): x is PromiseRejectedResult => x.status === "rejected");
    if (!assets.length) return void toast.error((failed?.reason as Error)?.message ?? "Upload failed", { id });
    toast.success(`${assets.length === 1 ? assets[0].filename : `${assets.length} files`} in the library`, { id, description: failed && "Some didn't upload." });
    placeMedia(
      assets.map((a) => libraryMedia(a, url)),
      target,
    );
  };

  /**
   * Library assets onto the page where they were dropped (or clicked in the
   * library panel): into a section of pictures as items, as the picture of
   * a section that takes one, else a gallery of them between sections, or
   * after the picked one.
   */
  const placeMedia = (media: Media[], target: Over | null) => {
    if (!media.length) return;
    const l = live.current;
    l.addMedia(media);
    const at = l.state.selection.page;
    const s = target && l.state.pages.get(at)?.find((x) => x.id === target.id);
    const update = (x: Section, set: Record<string, unknown>) => l.apply({ kind: "page", page: at, op: { op: "update", id: x.id, set } });
    if (s && target.mode === "into") {
      const blank = blankItem(s, l.state.rules, pages);
      if (blank?.kind === "asset") return void update(s, insertItems(s, s.items?.length ?? 0, media.map((m) => ({ ...blank.with, asset: m.id }) as Item)));
      return void update(s, { props: { ...s.props, image: media[0].id } });
    }
    const list = l.state.pages.get(at) ?? [];
    const after = target ? (target.mode === "before" ? (list[list.findIndex((x) => x.id === target.id) - 1]?.id ?? null) : target.id) : (list.at(-1)?.id ?? null);
    l.insert({ template: "gallery", title: "", items: media.map((m) => ({ asset: m.id })) }, after);
  };

  const drop = (p: Payload, o: Over, e: React.DragEvent) => {
    const at = stored.findIndex((x) => x.id === o.id);
    const prev = stored[at - 1]?.id ?? null;
    if (p.kind === "section") {
      const to = o.mode === "before" ? prev : o.id;
      const was = stored[stored.findIndex((x) => x.id === p.id) - 1]?.id ?? null;
      if (o.id === p.id || to === p.id || to === was) return;
      transition(() => {
        if (b.apply({ kind: "page", page: slug, op: { op: "move", id: p.id, after: to } })) b.select({ section: p.id, rule: null });
      });
    } else if (p.kind === "template") {
      b.insert(starter(p.template, b.state.rules, b.view.brand.name, storedOf(o.id)?.tab), o.mode === "before" ? prev : o.id);
    } else if (p.kind === "rule") {
      const s = storedOf(o.id);
      if (s) b.apply({ kind: "page", page: slug, op: { op: "update", id: s.id, set: { keys: [...s.keys, p.key] } } });
      b.select({ section: o.id, rule: null });
    } else if (p.kind === "files") {
      void dropFiles(pictureFiles(e), o);
    } else if (p.kind === "assets") {
      placeMedia(p.media, o);
    }
  };

  /** An item dragged over its section: the item under the pointer, else the nearest, and which side of it. */
  const overItem = (e: React.DragEvent, s: Section) => {
    const block = e.currentTarget;
    let el = (e.target as Element).closest?.("[data-item-root]");
    if (!el || !block.contains(el)) {
      let best = Infinity;
      for (const x of block.querySelectorAll("[data-item-root]")) {
        const r = x.getBoundingClientRect();
        const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
        if (r.width && d < best) [best, el] = [d, x];
      }
    }
    if (!el) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const r = el.getBoundingClientRect();
    // Side by side (a grid, a row): which half across; stacked: which half down. Right to left, the start is on the right.
    const across = r.width < block.getBoundingClientRect().width * 0.6;
    const rtl = getComputedStyle(el).direction === "rtl";
    const after = across ? (e.clientX > r.left + r.width / 2) !== rtl : e.clientY > r.top + r.height / 2;
    const i = Number((el as HTMLElement).dataset.itemRoot);
    if (itemOver?.i !== i || itemOver.after !== after || itemOver.section !== s.id) setItemOver({ section: s.id, i, after, across, box: boxOf(el, block) });
  };

  const dropItem = (p: Extract<Payload, { kind: "item" }>, s: Section) => {
    const o = itemOver;
    if (!o || o.section !== s.id) return;
    let to = o.i + (o.after ? 1 : 0);
    if (p.i < to) to--;
    if (to === p.i) return;
    b.apply({ kind: "page", page: slug, op: { op: "update", id: s.id, set: moveItem(s, p.i, to) } });
    ringItem(s.id, to);
  };

  /** The picked pictures as items, or as item `at`'s picture. */
  const savePictures = (p: Pictures, assets: ViewAsset[]) => {
    const s = storedOf(p.section);
    if (!s || !assets.length) return;
    b.addMedia(assets.map((a) => asMedia(a, url)));
    const field = p.prop ? pictureFields(s.template).find((f) => f.name === p.prop) : undefined;
    if (field) return void b.apply({ kind: "page", page: slug, op: { op: "update", id: s.id, set: { props: withProp(s.props, field, assets[0].id) } } });
    const blank = blankItem(s, b.state.rules, pages);
    const set = p.replace
      ? { items: s.items!.map((x, k) => (k === p.at ? { ...x, asset: assets[0].id } : x)) }
      : insertItems(s, p.at, assets.map((a) => ({ ...(blank?.kind === "asset" ? blank.with : {}), asset: a.id }) as Item));
    b.apply({ kind: "page", page: slug, op: { op: "update", id: s.id, set } });
  };

  const draw = (s: Section) => {
    const rules = boundKeys(s).flatMap((k) => byKey.get(k) ?? []);
    if (preview) return <SectionView key={s.id} section={s} rules={rules} />;
    const on = selected === s.id;
    // Picked with Shift or Cmd besides the selection: ringed too, for the bar that changes them all.
    const also = !on && b.picked.includes(s.id);
    const line = over?.id === s.id ? over : null;
    const own = storedOf(s.id) ?? s;
    const blank = on ? blankItem(own, b.state.rules, pages) : null;
    const hovered = on && grip?.section === s.id ? grip : null;
    const picked = on && chosen?.section === s.id && own.items?.[chosen.i] ? chosen : null;
    // The bar sits on the picked item; with none picked, on the one under the pointer.
    const handle = picked ?? hovered;
    const iline = itemOver?.section === s.id ? itemOver : null;
    const change = changes?.bySection.get(s.id);
    const threads = b.comments.bySection.get(sectionKey(slug, s.id)) ?? 0;
    return (
      <ContextMenu
        key={s.id}
        onOpenChange={(open) => {
          if (!open) setMenu(null);
        }}
      >
        <ContextMenuTrigger asChild disabled={native}>
          <div
            {...{ [BLOCK]: s.id }}
            // Its name in a view transition: a moved section glides to its place, its neighbours slide.
            data-vt={`block-${s.id}`}
            tabIndex={0}
            role="group"
            aria-label={`${TEMPLATE_INFO[s.template]?.name ?? s.template} section${s.title ? `: ${s.title}` : ""}`}
            className={cn("group/block relative transition-opacity outline-none [&>section]:transition-opacity", s.hidden && "[&>section]:opacity-50", moving === s.id && "opacity-40")}
            onPointerEnter={() => setHover(s.id)}
            onPointerLeave={() => {
              setHover((h) => (h === s.id ? null : h));
              setGrip((g) => (g?.section === s.id ? null : g));
            }}
            onPointerMove={(e) => {
              if (!on) return;
              const el = (e.target as Element).closest?.("[data-item-root]");
              if (!el || !e.currentTarget.contains(el)) return;
              const i = Number((el as HTMLElement).dataset.itemRoot);
              if (grip?.section !== s.id || grip.i !== i) setGrip({ section: s.id, i, box: boxOf(el, e.currentTarget) });
            }}
            onPointerDownCapture={(e) => {
              // A right click (or Ctrl+click) while typing is the browser's: spelling, paste.
              if (e.button !== 2 && !e.ctrlKey) return;
              const a = document.activeElement;
              setNative(!!a?.matches(FIELD) && a.contains(e.target as Node));
            }}
            onPointerDown={(e) => {
              // Shift or Cmd adds the section to the ones picked (or takes it out), and does nothing else.
              if (e.shiftKey || e.metaKey) {
                adding.current = true;
                b.pick(s.id, { add: true });
                return;
              }
              // One click picks the section and, when it lands on one of its items, that item too; elsewhere in the section, the section alone.
              const t = e.target as Element;
              if (!on) b.select({ section: s.id, rule: null });
              const el = t.closest?.("[data-item-root]");
              if (el && e.currentTarget.contains(el)) {
                const i = Number((el as HTMLElement).dataset.itemRoot);
                if (b.item?.section !== s.id || b.item.i !== i) b.setItem({ section: s.id, i });
              } else if (t.closest?.("section[data-template]") && b.item) b.setItem(null);
            }}
            onDoubleClick={(e) => {
              // A picture in the picked section: another from the library, for the item it is in, else for the section.
              const t = e.target as Element;
              if (!on || b.state.lang || !t.closest?.("img, video")) return;
              const el = t.closest("[data-item-root]");
              if (el && e.currentTarget.contains(el)) {
                const i = Number((el as HTMLElement).dataset.itemRoot);
                if (own.items?.[i] && (PICTURED.has(own.template) || own.items[i].asset)) onPictures(s.id, i, true);
                return;
              }
              const prop = pictureFields(own.template).find((f) => f.name === "image");
              if (prop) setPictures({ section: s.id, at: 0, replace: true, prop: prop.name });
            }}
            onFocus={() => {
              // The focus a Shift or Cmd click brings is not a pick of its own.
              if (adding.current) return void (adding.current = false);
              if (!on) b.select({ section: s.id, rule: null });
            }}
            onContextMenuCapture={(e) => {
              if (native) return;
              const el = (e.target as Element).closest?.("[data-item-root]");
              const i = el && e.currentTarget.contains(el) ? Number((el as HTMLElement).dataset.itemRoot) : null;
              setMenu({ id: s.id, item: i });
              if (!on) b.select({ section: s.id, rule: null });
              // As a click: what is right clicked is what is picked.
              if (i !== null) b.setItem({ section: s.id, i });
            }}
            onDragStart={(e) => {
              // Only the handle moves a section; a picture or a link dragged out stays the browser's.
              if (!(e.target as Element).closest?.(`[${HANDLE}]`)) return;
              startDrag(e, { kind: "section", id: s.id });
              e.dataTransfer.setDragImage(e.currentTarget, 24, 24);
              // After the drag has begun: changing the page under it in dragstart can call it off.
              requestAnimationFrame(() => setMoving(s.id));
            }}
            onDragOver={(e) => {
              const p = payloadOf(e);
              if (!p) return;
              if (p.kind === "item") return p.section === s.id ? overItem(e, own) : undefined;
              const mode = modeFor(p, own, e);
              if (!mode) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = p.kind === "section" ? "move" : "copy";
              if (line?.mode !== mode) setOver({ id: s.id, mode });
            }}
            onDrop={(e) => {
              const p = payloadOf(e);
              if (!p) return;
              e.preventDefault();
              if (p.kind === "item") dropItem(p, own);
              else if (over?.id === s.id) drop(p, over, e);
              clear();
              endDrag();
            }}
            onDragEnd={() => {
              clear();
              endDrag();
            }}
          >
            {(on || hover === s.id) && (
              // A pointer only passing over waits a beat, so sweeping down the page doesn't strobe toolbars.
              <div
                className={cn(
                  "animate-in fade-in-0 slide-in-from-bottom-1 absolute start-4 top-0 z-30 max-w-[calc(100%-2rem)] -translate-y-1/2 duration-100",
                  !on && "fill-mode-backwards delay-100",
                )}
              >
                <SectionToolbar b={b} section={own} />
              </div>
            )}
            <PickedContext.Provider value={on}>
              <SectionView section={s} rules={rules} />
            </PickedContext.Provider>
            <div
              aria-hidden
              className={cn(
                "app-tokens pointer-events-none absolute inset-0 z-10 ring-inset transition-[box-shadow,background-color]",
                line?.mode === "into" ? "ring-primary bg-primary/5 ring-4" : on ? "ring-primary ring-2" : also ? "ring-primary/70 bg-primary/5 ring-2" : "group-hover/block:ring-primary/40 group-hover/block:ring-1",
                "group-focus-visible/block:ring-ring group-focus-visible/block:ring-3",
              )}
            />
            {change && (
              <div
                aria-hidden
                className={cn(
                  "app-tokens pointer-events-none absolute inset-1 z-10 rounded-sm outline-2 outline-dashed",
                  change === "new" ? "outline-success" : "outline-warning",
                )}
              />
            )}
            {(s.hidden || change || threads > 0 || on) && (
              <span className="app-tokens pointer-events-none absolute end-4 top-3 z-20 flex items-center gap-1 font-sans text-xs">
                {/* Its open threads, or, picked, a way in to the first one. */}
                {(threads > 0 || on) && (
                  <CommentBadge
                    count={threads}
                    className="pointer-events-auto"
                    onClick={() => {
                      b.pick(s.id);
                      b.setCommentsOnPage(false);
                      b.setDock("comments");
                    }}
                  />
                )}
                {change && (
                  <span className={cn("rounded-full px-2 py-0.5 font-medium", change === "new" ? "bg-highlight text-highlight-foreground" : "bg-warning text-white")}>
                    {CHANGE_LABEL[change]}
                    <span className="sr-only"> since the last release</span>
                  </span>
                )}
                {s.hidden && <span className="bg-foreground text-background rounded-full px-2 py-0.5">Hidden from readers</span>}
              </span>
            )}
            {hovered && hovered.i !== picked?.i && !moving && (
              <div
                aria-hidden
                className="app-tokens ring-primary/50 pointer-events-none absolute z-20 rounded-sm ring-1"
                style={{ left: hovered.box.x - 2, top: hovered.box.y - 2, width: hovered.box.w + 4, height: hovered.box.h + 4 }}
              />
            )}
            {picked && !moving && (
              <div
                aria-hidden
                className="app-tokens ring-primary pointer-events-none absolute z-20 rounded-sm ring-2"
                style={{ left: picked.box.x - 3, top: picked.box.y - 3, width: picked.box.w + 6, height: picked.box.h + 6 }}
              />
            )}
            {handle && !moving && own.items?.[handle.i] && (
              <ItemBar
                b={b}
                s={own}
                i={handle.i}
                box={handle.box}
                onPictures={() => onPictures(s.id, handle.i, true)}
                onDone={() => setGrip(null)}
                onDragStart={(e) => {
                  e.stopPropagation();
                  startDrag(e, { kind: "item", section: s.id, i: handle.i });
                  const el = e.currentTarget.closest(`[${BLOCK}]`)?.querySelector(`[data-item-root="${handle.i}"]`);
                  if (el) e.dataTransfer.setDragImage(el, 16, 16);
                }}
                onDragEnd={() => {
                  clear();
                  endDrag();
                }}
              />
            )}
            {iline && (
              <div
                aria-hidden
                className="app-tokens bg-primary pointer-events-none absolute z-40 rounded-full transition-[left,top] duration-75"
                style={
                  iline.across
                    ? { left: (iline.after !== (getComputedStyle(document.documentElement).direction === "rtl") ? iline.box.x + iline.box.w : iline.box.x) - 2, top: iline.box.y, width: 4, height: iline.box.h }
                    : { left: iline.box.x, top: (iline.after ? iline.box.y + iline.box.h : iline.box.y) - 2, width: iline.box.w, height: 4 }
                }
              />
            )}
            {blank && !b.state.lang && (
              <button
                type="button"
                className="app-tokens bg-background text-foreground hover:bg-accent focus-visible:ring-ring/50 absolute end-4 bottom-4 z-30 flex h-7 items-center gap-1 rounded-full border px-2.5 font-sans text-xs font-medium shadow-sm outline-none focus-visible:ring-3"
                onClick={() => {
                  const n = own.items?.length ?? 0;
                  if (blank.kind === "asset") onPictures(s.id, n, false);
                  else {
                    b.apply({ kind: "page", page: slug, op: { op: "update", id: s.id, set: insertItems(own, n, [blank.item]) } });
                    ringItem(s.id, n);
                  }
                }}
              >
                <IconPlus aria-hidden className="size-3.5" />
                {ADD_LABEL[s.template] ?? "Add an item"}
              </button>
            )}
            {line && line.mode !== "into" && (
              <div
                aria-hidden
                className={cn(
                  "app-tokens bg-primary pointer-events-none absolute inset-x-0 z-40 h-1 rounded-full",
                  line.mode === "before" ? "top-0 -translate-y-1/2" : "bottom-0 translate-y-1/2",
                )}
              />
            )}
            <Seam b={b} after={s.id} />
          </div>
        </ContextMenuTrigger>
        {menu?.id === s.id && (
          <SectionMenu
            b={b}
            s={own}
            item={menu.item !== null && own.items?.[menu.item] ? menu.item : null}
            onPictures={(at, replace) => onPictures(s.id, at, replace)}
            onSectionPicture={(prop) => setPictures({ section: s.id, at: 0, replace: true, prop })}
          />
        )}
      </ContextMenu>
    );
  };

  return (
    <div
      ref={stage}
      style={look.style}
      lang={look.lang}
      dir={look.dir}
      data-motion={view.theme.motion}
      className={cn(look.className, "@container/site min-h-full")}
      onPointerDown={(e) => {
        // A click on the page around the sections lets go of the selection; one in a popover over it (portalled) doesn't.
        const t = e.target as Element;
        if (preview || !e.currentTarget.contains(t) || t.closest(`[${BLOCK}]`)) return;
        if (selected || b.state.selection.rule) b.select({ section: null, rule: null });
      }}
      onClick={(e) => {
        const a = (e.target as Element).closest?.("a[href]");
        if (!(a instanceof HTMLAnchorElement) || !e.currentTarget.contains(a)) return;
        if (preview && a.hasAttribute("download")) return;
        // Words are edited where links sit, so a click on one never leaves the builder.
        e.preventDefault();
        if (!preview) return;
        const u = new URL(a.href);
        const to = u.origin === location.origin && u.pathname === location.pathname ? u.searchParams.get("page") : null;
        if (to && to !== slug) b.open(to);
        else if (u.hash && (to || u.origin === location.origin)) document.getElementById(decodeURIComponent(u.hash.slice(1)))?.scrollIntoView();
        else if (!to) window.open(a.href, "_blank", "noopener");
      }}
      onDragOver={(e) => {
        if (preview || e.defaultPrevented) return;
        const p = payloadOf(e);
        // A section onto a page tab: it moves under that tab.
        const tab = (e.target as Element).closest?.<HTMLElement>("[data-tab-name]")?.dataset.tabName;
        if (p?.kind === "section" && tab !== undefined) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (overTab !== tab) setOverTab(tab);
          return;
        }
        if (overTab !== null) setOverTab(null);
        // An empty page takes a block or pictures anywhere; a page with sections, on the way in at its end.
        const last = !shown.length || !!(e.target as Element).closest?.(`[${END}]`);
        if (last && (p?.kind === "template" || p?.kind === "files" || p?.kind === "assets")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={(e) => {
        if (preview || e.defaultPrevented) return;
        const p = payloadOf(e);
        if (!p) return;
        e.preventDefault();
        if (p.kind === "section" && overTab !== null) {
          const s = storedOf(p.id);
          if (s && s.tab !== overTab) b.apply({ kind: "page", page: slug, op: { op: "update", id: s.id, set: { tab: overTab } } });
        } else if (p.kind === "template" || p.kind === "files" || p.kind === "assets") {
          const last = !shown.length || !!(e.target as Element).closest?.(`[${END}]`);
          if (last && p.kind === "template") b.insert(starter(p.template, b.state.rules, b.view.brand.name), stored.at(-1)?.id ?? null);
          else if (last && p.kind === "assets") placeMedia(p.media, null);
          else if (last) void dropFiles(pictureFiles(e), null);
        }
        clear();
        endDrag();
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) clear();
      }}
    >
      {look.faces && <style>{look.faces}</style>}
      {overTab !== null && <style>{`[data-tab-name="${CSS.escape(overTab)}"]{outline:2px solid var(--primary);outline-offset:2px;border-radius:6px}`}</style>}
      <article className="@container pb-16">
        {changes && !preview && <ChangesStrip changes={changes} onHide={() => b.setChanges(false)} />}
        <PageHeader page={page} roots={roots} />
        {!preview && shown.length > 0 && (
          <div className="relative">
            <Seam b={b} after={null} />
          </div>
        )}
        {before.map(draw)}
        {tabs.length > 0 && <PageTabs tabs={tabs} render={draw} />}
        {after.map(draw)}
        {!preview && <Seam b={b} after={stored.at(-1)?.id ?? null} always="end" />}
      </article>
      {b.library && !preview && (
        <LibraryPanel
          b={b}
          onClose={() => b.setLibrary(false)}
          onPlace={(media) => {
            // Onto the picked section: into it where it takes pictures, else as a gallery after it (at the page's end with none picked).
            const s = selected ? storedOf(selected) : undefined;
            const into = s && (blankItem(s, b.state.rules, pages)?.kind === "asset" || imageProp(s));
            placeMedia(media, s ? { id: s.id, mode: into ? "into" : "after" } : null);
          }}
        />
      )}
      <AssetPicker
        open={pictures !== null}
        rule={standIn(pictures?.replace ? "Picture" : "Pictures", undefined)}
        title={pictures?.replace ? "Pick a picture" : "Pick pictures"}
        description={
          pictures?.prop
            ? "From the library, for this section."
            : pictures?.replace
              ? "From the library, for this item."
              : "Each becomes an item, in the order picked."
        }
        transport={b.transport}
        onClose={() => setPictures(null)}
        onSave={(assets) => {
          const p = pictures;
          setPictures(null);
          if (p) savePictures(p, assets);
        }}
      />
    </div>
  );
}

/** An item bar's button: small, named in its tooltip. */
function ItemTool({ label, className, ...p }: React.ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn("hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 flex size-6 items-center justify-center rounded outline-none focus-visible:ring-2 [&_svg]:size-3.5", className)}
      {...p}
    />
  );
}

/**
 * On the item under the pointer, in the picked section: the grip that drags
 * it among its section's items, then what is done to one item most, in view
 * rather than behind a right click: its picture (where its template's items
 * carry one), its settings in the section panel, a copy, and away with it.
 */
function ItemBar({
  b,
  s,
  i,
  box,
  onPictures,
  onDone,
  onDragStart,
  onDragEnd,
}: {
  b: BuilderApi;
  s: Section;
  i: number;
  box: Box;
  onPictures(): void;
  /** The item is gone or moved: the bar lets go of it. */
  onDone(): void;
  onDragStart(e: React.DragEvent<HTMLElement>): void;
  onDragEnd(): void;
}) {
  const page = b.state.selection.page;
  const it = s.items![i];
  const set = (patch: Record<string, unknown>) => b.apply({ kind: "page", page, op: { op: "update", id: s.id, set: patch } });
  return (
    <div
      role="toolbar"
      aria-label={`Item ${i + 1}`}
      // Just above the item, as a design tool labels a selection, so it never covers what it acts on.
      style={{ left: box.x - 3, top: box.y - 34 }}
      className="app-tokens bg-background text-muted-foreground absolute z-30 flex items-center gap-px rounded-md border p-px font-sans shadow-sm"
    >
      <span
        draggable
        role="button"
        tabIndex={-1}
        title="Drag to move this item. Right click it for more."
        aria-label={`Move item ${i + 1}`}
        className="hover:text-foreground flex size-6 cursor-grab items-center justify-center rounded active:cursor-grabbing"
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <IconGripVertical className="size-3.5" />
      </span>
      {!b.state.lang && (
        <>
          {(PICTURED.has(s.template) || it.asset) && (
            <ItemTool label={it.asset ? "Change picture" : "Add a picture"} onClick={onPictures}>
              <IconPhoto />
            </ItemTool>
          )}
          <ItemTool
            label="Item settings"
            onClick={() => {
              b.setItem({ section: s.id, i });
              b.setDock("section");
            }}
          >
            <IconAdjustmentsHorizontal />
          </ItemTool>
          <ItemTool
            label="Duplicate item (Cmd+D)"
            onClick={() => {
              set(duplicateItem(s, i));
              ringItem(s.id, i + 1);
              onDone();
            }}
          >
            <IconCopy />
          </ItemTool>
          <ItemTool
            label="Remove item (Delete)"
            className="hover:text-destructive"
            onClick={() => {
              set(removeItem(s, i));
              if (b.item?.section === s.id) b.setItem(null);
              onDone();
            }}
          >
            <IconTrash />
          </ItemTool>
        </>
      )}
    </div>
  );
}

/** Over the page while changes are marked: since which publish, how many sections are new or changed, and which are gone. */
function ChangesStrip({ changes, onHide }: { changes: Changes; onHide(): void }) {
  const count = (c: string) => [...changes.bySection.values()].filter((x) => x === c).length;
  const [fresh, changed, rule] = [count("new"), count("changed"), count("rule")];
  const said = changes.loading
    ? "Reading the last release…"
    : changes.error
      ? changes.error
      : changes.since === null
        ? "Never released: everything here is new to readers."
        : [
            `Since release @${changes.since}:`,
            [fresh && `${fresh} new`, changed && `${changed} changed`, rule && `${rule} with a rule changed`, changes.removed.length && `${changes.removed.length} removed (${changes.removed.join(", ")})`]
              .filter(Boolean)
              .join(", ") || "nothing on this page.",
          ].join(" ");
  return (
    <div role="status" className="app-tokens bg-muted text-foreground sticky top-12 z-20 flex items-center gap-2 border-b px-4 py-1.5 font-sans text-sm">
      <IconGitCompare aria-hidden className="text-muted-foreground size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{said}</span>
      <button type="button" onClick={onHide} className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 shrink-0 rounded-sm text-xs outline-none focus-visible:ring-2">
        Stop marking
      </button>
    </div>
  );
}
