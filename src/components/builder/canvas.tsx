"use client";

import { useMemo, useState } from "react";
import { IconDeviceDesktop, IconDeviceMobile, IconDeviceTablet } from "@tabler/icons-react";
import { SectionView } from "@/components/brand-sections";
import { useSiteLook } from "@/components/brand-sections/look";
import { RuleCard } from "@/components/builder/rule-card";
import { BLOCK, Seam } from "@/components/builder/seam";
import { HANDLE, SectionToolbar } from "@/components/builder/section-toolbar";
import type { BuilderApi } from "@/components/builder/use-builder";
import { PageHeader } from "@/components/site/page-header";
import { type Edit, EditContext, SiteProvider, useSite } from "@/components/site/site-context";
import { PageTabs } from "@/components/site/tabs";
import { boundKeys, TEMPLATE_INFO, type Section } from "@/lib/pages";
import { resolve } from "@/lib/rules";
import { groupTabs, tree } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * The page being edited (build spec 3.5.2, W6.2): PageBody of b.view.page
 * inside SiteProvider (view b.view, mode "edit") and EditContext (built from
 * b: update is a `page` op on b.state.selection.page), in the brand's theme,
 * editor chrome in `.app-tokens`. Around each section: its SectionToolbar on
 * hover or selection, a Seam between. A clicked specimen opens its RuleCard,
 * anchored there (the canvas holds which). Drag on the handle reorders
 * (b.apply move). A width toggle of its own narrows the container to 390 or
 * 768px (D11). b.state.preview shows the page as readers see it, no chrome.
 * b.view.page is null while a page loads.
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

/** What a drag carries: the section's id, under a type no other drag has. */
const DRAG = "application/x-brand-section";

export function Canvas({ b }: CanvasProps) {
  const [width, setWidth] = useState<number | null>(null);
  const [card, setCard] = useState<{ page: string; key: string; anchor: HTMLElement } | null>(null);
  const { apply, select, addMedia } = b;
  const { page: slug, section, rule } = b.state.selection;
  const { lang, preview } = b.state;

  // Stable while typing, so slots don't redraw for a keystroke elsewhere.
  const edit = useMemo<Edit>(
    () => ({
      update: (id, set) => void apply({ kind: "page", page: slug, op: { op: "update", id, set } }),
      setRule: (r) => void apply({ kind: "rules", set: [r], remove: [] }),
      addMedia,
      selection: { section, rule },
      select,
      openRule: (key, anchor) => {
        setCard({ page: slug, key, anchor });
        select({ rule: key });
      },
      lang,
    }),
    [apply, select, addMedia, slug, section, rule, lang],
  );

  return (
    <div className={cn("relative min-h-full", width && "bg-muted")}>
      <div className={cn("mx-auto min-h-full", width && "bg-background border-x shadow-sm")} style={{ maxInlineSize: width ?? undefined }}>
        {b.view.page ? (
          <SiteProvider view={b.view} href={href} mode={preview ? "read" : "edit"} idPrefix={PREFIX}>
            <EditContext.Provider value={preview ? null : edit}>
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
            </EditContext.Provider>
          </SiteProvider>
        ) : (
          <p role="status" className="text-muted-foreground px-6 py-16 text-center text-sm">
            Opening the page…
          </p>
        )}
      </div>
      <div role="group" aria-label="Canvas width" className="app-tokens bg-background sticky bottom-4 z-40 mx-auto mt-4 flex w-fit gap-0.5 rounded-lg border p-0.5 font-sans shadow-md">
        {WIDTHS.map(([w, I, label]) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            title={label}
            aria-pressed={width === w}
            onClick={() => setWidth(w)}
            className="text-muted-foreground hover:bg-accent aria-pressed:bg-accent aria-pressed:text-foreground focus-visible:ring-ring/50 flex size-7 items-center justify-center rounded-md outline-none focus-visible:ring-3"
          >
            <I className="size-4" />
          </button>
        ))}
      </div>
    </div>
  );
}

type Drag = { id: string; over: { id: string; before: boolean } | null };

/** The page in the brand's look: its header, then its sections, each in a Block. */
function Stage({ b }: { b: BuilderApi }) {
  const { view, context } = useSite();
  const look = useSiteLook();
  const page = view.page!;
  const { preview } = b.state;
  const { page: slug, section: selected } = b.state.selection;
  const [hover, setHover] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  const roots = useMemo(() => tree(view.nav, view.theme.numbering), [view.nav, view.theme.numbering]);
  // As PageBody: one resolution for the page, so each section gets the same rule objects every time and its memo holds.
  const byKey = useMemo(() => new Map(resolve(view.rules, context ?? "").map((r) => [r.key, r])), [view.rules, context]);
  const shown = useMemo(
    () => page.sections.filter((s) => (!s.only || (s.only === "default" ? null : s.only) === context) && !(preview && s.hidden)),
    [page.sections, context, preview],
  );
  const { before, tabs, after } = useMemo(() => groupTabs(shown), [shown]);
  const stored = b.state.pages.get(slug) ?? [];

  const drop = () => {
    const d = drag;
    setDrag(null);
    if (!d?.over) return;
    const at = stored.findIndex((x) => x.id === d.over!.id);
    const to = d.over.before ? (stored[at - 1]?.id ?? null) : d.over.id;
    const was = stored[stored.findIndex((x) => x.id === d.id) - 1]?.id ?? null;
    if (d.over.id === d.id || to === d.id || to === was) return;
    if (b.apply({ kind: "page", page: slug, op: { op: "move", id: d.id, after: to } })) b.select({ section: d.id, rule: null });
  };

  const draw = (s: Section) => {
    const rules = boundKeys(s).flatMap((k) => byKey.get(k) ?? []);
    if (preview) return <SectionView key={s.id} section={s} rules={rules} />;
    const on = selected === s.id;
    const line = drag?.over?.id === s.id ? drag.over : null;
    return (
      <div
        key={s.id}
        {...{ [BLOCK]: s.id }}
        tabIndex={0}
        role="group"
        aria-label={`${TEMPLATE_INFO[s.template]?.name ?? s.template} section${s.title ? `: ${s.title}` : ""}`}
        className={cn("group/block relative outline-none", s.hidden && "[&>section]:opacity-50", drag?.id === s.id && "opacity-40")}
        onPointerEnter={() => setHover(s.id)}
        onPointerLeave={() => setHover((h) => (h === s.id ? null : h))}
        onPointerDown={() => on || b.select({ section: s.id, rule: null })}
        onFocus={() => on || b.select({ section: s.id, rule: null })}
        onDragStart={(e) => {
          // Only the handle moves a section; a picture or a link dragged out stays the browser's.
          if (!(e.target as Element).closest?.(`[${HANDLE}]`)) return;
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData(DRAG, s.id);
          e.dataTransfer.setDragImage(e.currentTarget, 24, 24);
          // After the drag has begun: changing the page under it in dragstart can call it off.
          requestAnimationFrame(() => setDrag({ id: s.id, over: null }));
        }}
        onDragOver={(e) => {
          if (!drag) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          const r = e.currentTarget.getBoundingClientRect();
          const above = e.clientY < r.top + r.height / 2;
          if (line?.before !== above) setDrag({ ...drag, over: { id: s.id, before: above } });
        }}
        onDrop={(e) => {
          if (!drag) return;
          e.preventDefault();
          drop();
        }}
        onDragEnd={() => setDrag(null)}
      >
        {(on || hover === s.id) && (
          <div className="absolute start-4 top-0 z-30 max-w-[calc(100%-2rem)] -translate-y-1/2">
            <SectionToolbar b={b} section={stored.find((x) => x.id === s.id) ?? s} />
          </div>
        )}
        <SectionView section={s} rules={rules} />
        <div
          aria-hidden
          className={cn(
            "app-tokens pointer-events-none absolute inset-0 z-10 ring-inset",
            on ? "ring-primary ring-2" : "group-hover/block:ring-primary/40 group-hover/block:ring-1",
            "group-focus-visible/block:ring-ring group-focus-visible/block:ring-3",
          )}
        />
        {s.hidden && (
          <span className="app-tokens bg-foreground text-background pointer-events-none absolute end-4 top-3 z-20 rounded-full px-2 py-0.5 font-sans text-xs">
            Hidden from readers
          </span>
        )}
        {line && (
          <div
            aria-hidden
            className={cn("app-tokens bg-primary pointer-events-none absolute inset-x-0 z-40 h-1 rounded-full", line.before ? "top-0 -translate-y-1/2" : "bottom-0 translate-y-1/2")}
          />
        )}
        <Seam b={b} after={s.id} />
      </div>
    );
  };

  return (
    <div
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
    >
      {look.faces && <style>{look.faces}</style>}
      <article className="@container pb-16">
        <PageHeader page={page} roots={roots} />
        {!preview && shown.length > 0 && (
          <div className="relative">
            <Seam b={b} after={null} />
          </div>
        )}
        {before.map(draw)}
        {tabs.length > 0 && <PageTabs tabs={tabs} render={draw} />}
        {after.map(draw)}
        {!preview && !shown.length && <Seam b={b} after={null} always />}
      </article>
    </div>
  );
}
