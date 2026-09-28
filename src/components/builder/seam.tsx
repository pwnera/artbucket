"use client";

import { useRef, useState } from "react";
import { IconPlus } from "@tabler/icons-react";
import { Thumbnail } from "@/components/builder/thumbnails";
import type { BuilderApi } from "@/components/builder/use-builder";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TEMPLATE_INFO, TEMPLATES, type Section, type Template } from "@/lib/pages";
import type { ViewRule } from "@/lib/site";
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
 * - always: shown without the pointer on it (an empty page's only way in).
 */
export type SeamProps = {
  b: BuilderApi;
  after: string | null;
  always?: boolean;
};

/**
 * A template's example, made this brand's: its own name for Blender's, its
 * rules where the example's aren't there (as many as the example binds, of
 * those the template takes), and no `from` page it doesn't have. In the
 * tab of the section it follows, so it lands beside it.
 */
export function starter(t: Template, rules: ViewRule[], brand: string, pages: string[], tab?: string): Record<string, unknown> {
  const info = TEMPLATE_INFO[t];
  const s = JSON.parse(JSON.stringify(info.example).replaceAll("Blender", JSON.stringify(brand).slice(1, -1))) as Record<string, unknown> & Partial<Section>;
  if (s.keys) {
    const have = new Set(rules.map((r) => r.key));
    const kept = s.keys.filter((k) => have.has(k));
    s.keys = kept.length ? kept : [...new Set(rules.filter((r) => info.accepts?.(r)).map((r) => r.key))].slice(0, s.keys.length);
  }
  if (typeof s.props?.from === "string" && !pages.includes(s.props.from)) delete s.props.from;
  if (tab) s.tab = tab;
  return s;
}

/** What marks a section's block on the canvas, which focus goes to once it is added. */
export const BLOCK = "data-canvas-block";

export function Seam({ b, after, always }: SeamProps) {
  const [open, setOpen] = useState(false);
  const made = useRef<string | null>(null);
  const page = b.state.selection.page;

  const add = (t: Template) => {
    const tab = after ? b.state.pages.get(page)?.find((x) => x.id === after)?.tab : undefined;
    const section = starter(t, b.state.rules, b.view.brand.name, b.state.nav.map((p) => p.slug), tab);
    const done = b.apply({ kind: "page", page, op: { op: "add", section: section as never, after } });
    setOpen(false);
    if (done?.kind !== "page" || done.op.op !== "add") return;
    made.current = done.op.section.id!;
    b.select({ section: made.current, rule: null });
  };

  return (
    <div className={cn("app-tokens group/seam z-20 flex items-center justify-center font-sans", always ? "py-16" : "absolute inset-x-0 -bottom-3 h-6")}>
      {!always && (
        <div
          aria-hidden
          className={cn("bg-primary pointer-events-none absolute inset-x-4 h-0.5 rounded-full opacity-0 transition-opacity group-hover/seam:opacity-100", open && "opacity-100")}
        />
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "bg-primary text-primary-foreground focus-visible:ring-ring/50 relative flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium shadow outline-none focus-visible:ring-3",
              !always && "opacity-0 transition-opacity group-hover/seam:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100",
            )}
          >
            <IconPlus aria-hidden className="size-3.5" />
            Add a section
          </button>
        </PopoverTrigger>
        <PopoverContent
          collisionPadding={8}
          className="@container flex max-h-(--radix-popover-content-available-height) w-[min(40rem,calc(100vw-2rem))] flex-col p-3"
          onCloseAutoFocus={(e) => {
            // To the new section, not back to this seam's button, whose section would take the selection back.
            const id = made.current;
            made.current = null;
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
                  <span className="text-muted-foreground line-clamp-2 text-xs">{TEMPLATE_INFO[t].use}</span>
                </button>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}
