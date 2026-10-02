"use client";

import { useRef, useState } from "react";
import { IconPlus } from "@tabler/icons-react";
import { Thumbnail } from "@/components/builder/thumbnails";
import type { BuilderApi } from "@/components/builder/use-builder";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TEMPLATE_INFO, TEMPLATES, type Item, type Section, type Template } from "@/lib/pages";
import { section } from "@/lib/rules";
import type { ViewRule } from "@/lib/site";
import { templateUse } from "@/lib/template-fields";
import { cn } from "@/lib/utils";

/**
 * Where a section goes in (build spec 3.5.2, W6.2): a line that shows where
 * the pointer is, opening a gallery of templates (Thumbnail and each
 * template's `example`); the pick is b.apply of an `add` op after `after`,
 * and the new section is selected (b.select with the op's section id).
 *
 * Props:
 * - b: the builder.
 * - after: the section it follows; null for the top of the page.
 * - always: "end", shown without the pointer on it: the standing way in under
 *   a page's last section (or on an empty page), with the blocks most pages
 *   take a click away.
 */
export type SeamProps = {
  b: BuilderApi;
  after: string | null;
  always?: "end";
};

/** The blocks most pages reach for next, one click each under the last section. */
const QUICK: Template[] = ["text", "split", "palette", "type", "dodont", "gallery"];

/** The example's words, which are Blender's: a new block starts without them, its empty slots naming what goes there. */
const WORDS = ["eyebrow", "title", "lede", "body", "aside"] as const;
const PROP_WORDS = ["by", "sample", "url", "form", "template", "prompt", "partner"];
/** What an item keeps of the example's: how it sits, never what it says. */
const ITEM_SHAPE = ["verdict", "at", "level", "span"] as const;
/** Blocks that show a kind of rule whole: every one of it the brand has, not the example's count. */
const ALL: Template[] = ["palette", "type", "chart", "pattern", "logos"];
/** Blocks whose words are the point: any rules the brand has would be a guess, so they start with none. */
const WRITTEN: Template[] = ["text", "statement", "quote", "cards", "copy"];

/**
 * A template's example, made this brand's: its shape (layout, items, how it
 * sits) without Blender's words, its rules where the example's aren't there
 * (as many as the example binds, of those the template takes; none for a
 * block that is written rather than drawn from rules), and no
 * `from` page it doesn't have. A cover keeps its words, the brand's name in
 * Blender's place. In the tab of the section it follows, so it lands beside it.
 */
export function starter(t: Template, rules: ViewRule[], brand: string, tab?: string): Record<string, unknown> {
  const info = TEMPLATE_INFO[t];
  const s = JSON.parse(JSON.stringify(info.example).replaceAll("Blender", JSON.stringify(brand).slice(1, -1))) as Record<string, unknown> & Partial<Section>;
  if (t !== "cover") {
    for (const w of WORDS) delete s[w];
    for (const p of PROP_WORDS) delete s.props?.[p];
    const needs = info.needs ?? [];
    s.items = s.items
      ?.map((it) => Object.fromEntries(ITEM_SHAPE.filter((f) => it[f] !== undefined).map((f) => [f, it[f]])) as Item)
      // A card or a question needs a title: an empty one to type.
      .map((it) => (needs.some((g) => g.includes("title")) && it.title === undefined ? { ...it, title: "" } : it))
      .filter((it) => needs.every((g) => g.some((f) => it[f] !== undefined)));
    if (!s.items?.length) delete s.items;
  }
  if (WRITTEN.includes(t)) delete s.keys;
  if (s.keys) {
    // This brand's rules of the example's groups (color, logo, space...) that the template can show: a palette
    // gets every color, a spacing specimen nothing rather than the voice. Never a rule it can't show.
    const groups = new Set(s.keys.map(section));
    const fit = [...new Set(rules.filter((r) => info.accepts?.(r) && groups.has(section(r.key))).map((r) => r.key))];
    s.keys = ALL.includes(t) ? fit.slice(0, 12) : fit.slice(0, s.keys.length);
    if (!s.keys.length) delete s.keys;
  }
  // The example's page and library filters are Blender's: this page's children, and the library's pictures.
  if (s.props?.from) delete s.props.from;
  if (t === "collection" && s.props) s.props.query = "type=image";
  if (t === "icons") delete s.props?.query;
  if (tab) s.tab = tab;
  return s;
}

/** Marks the standing way in at a page's end: a block or pictures dropped on it go last. */
export const END = "data-seam-end";

/** What marks a section's block on the canvas, which focus goes to once it is added. */
export const BLOCK = "data-canvas-block";

export function Seam({ b, after, always }: SeamProps) {
  const [open, setOpen] = useState(false);
  const made = useRef<string | null>(null);
  const page = b.state.selection.page;

  /** The section just added, once: where focus goes when the gallery closes. */
  const take = () => {
    const id = made.current;
    made.current = null;
    return id;
  };

  const add = (t: Template) => {
    const tab = after ? b.state.pages.get(page)?.find((x) => x.id === after)?.tab : undefined;
    const section = starter(t, b.state.rules, b.view.brand.name, tab);
    const done = b.apply({ kind: "page", page, op: { op: "add", section: section as never, after } });
    setOpen(false);
    if (done?.kind !== "page" || done.op.op !== "add") return;
    made.current = done.op.section.id!;
    b.select({ section: made.current, rule: null });
  };

  // mb-16: room under it for the canvas's floating device bar, which would cover the quick picks.
  if (always)
    return (
      <div {...{ [END]: "" }} className="app-tokens mx-auto mt-12 mb-16 grid max-w-3xl justify-items-center gap-3 rounded-xl border border-dashed px-4 py-8 font-sans">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="bg-primary text-primary-foreground focus-visible:ring-ring/50 flex h-8 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium shadow outline-none focus-visible:ring-3"
            >
              <IconPlus aria-hidden className="size-4" />
              Add a section
            </button>
          </PopoverTrigger>
          <Gallery add={add} take={take} />
        </Popover>
        <ul aria-label="Add quickly" className="flex flex-wrap justify-center gap-1.5">
          {QUICK.map((t) => (
            <li key={t}>
              <button
                type="button"
                onClick={() => add(t)}
                className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 rounded-full border px-2.5 py-1 text-xs outline-none focus-visible:ring-2"
              >
                {TEMPLATE_INFO[t].name}
              </button>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-xs">Or drag pictures here from your computer.</p>
      </div>
    );

  return (
    <div className="app-tokens group/seam absolute inset-x-0 -bottom-3 z-20 flex h-6 items-center justify-center font-sans">
      <div
        aria-hidden
        className={cn("bg-primary pointer-events-none absolute inset-x-4 h-0.5 rounded-full opacity-0 transition-opacity group-hover/seam:opacity-100", open && "opacity-100")}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="bg-primary text-primary-foreground focus-visible:ring-ring/50 relative flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium opacity-0 shadow outline-none transition-opacity group-hover/seam:opacity-100 focus-visible:opacity-100 focus-visible:ring-3 data-[state=open]:opacity-100"
          >
            <IconPlus aria-hidden className="size-3.5" />
            Add a section
          </button>
        </PopoverTrigger>
        <Gallery add={add} take={take} />
      </Popover>
    </div>
  );
}

/** Every template, with its thumbnail and what it is for: the pick adds it. Focus goes to the new section after. */
function Gallery({ add, take }: { add: (t: Template) => void; take: () => string | null }) {
  return (
    <PopoverContent
      collisionPadding={8}
      className="@container flex max-h-(--radix-popover-content-available-height) w-[min(40rem,calc(100vw-2rem))] flex-col p-3"
      onCloseAutoFocus={(e) => {
        // To the new section, not back to this seam's button, whose section would take the selection back.
        const id = take();
        if (!id) return;
        e.preventDefault();
        document.querySelector<HTMLElement>(`[${BLOCK}="${CSS.escape(id)}"]`)?.focus();
      }}
    >
      <p className="mb-2 px-1 text-sm font-medium">Add a section</p>
      <ul className="grid max-h-[min(28rem,60vh)] min-h-0 grid-cols-2 gap-2 overflow-y-auto @lg:grid-cols-3">
        {TEMPLATES.map((t) => (
          <li key={t}>
            <button
              type="button"
              onClick={() => add(t)}
              className="hover:border-primary hover:bg-primary/5 focus-visible:ring-ring/50 grid h-full w-full content-start gap-1.5 rounded-lg border p-2 text-start outline-none focus-visible:ring-3"
            >
              <span className="bg-muted text-foreground block rounded-md p-1.5">
                <Thumbnail template={t} className="block aspect-[8/5] w-full" />
              </span>
              <span className="text-sm font-medium">{TEMPLATE_INFO[t].name}</span>
              <span className="text-muted-foreground line-clamp-2 text-xs">{templateUse(t)}</span>
            </button>
          </li>
        ))}
      </ul>
    </PopoverContent>
  );
}
