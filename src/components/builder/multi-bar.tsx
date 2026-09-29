"use client";

import { IconArrowAutofitWidth, IconChevronDown, IconEye, IconEyeOff, IconFileArrowRight, IconTrash, IconX } from "@tabler/icons-react";
import { GROUNDS, WIDTHS } from "@/components/builder/section-toolbar";
import type { BuilderApi } from "@/components/builder/use-builder";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Op } from "@/lib/builder-ops";
import type { Section } from "@/lib/pages";

/**
 * With more than one section picked (Shift or Cmd click, on the canvas or
 * in the layers), what changes them all at once, as a design tool's bar for
 * a multiple selection: their ground, their width, whether readers see
 * them, the page they are on, and deleting them. Each is one step to undo
 * (b.applyAll); Esc or the X keeps only the first one picked.
 *
 * Props:
 * - b: the builder.
 */
export function MultiBar({ b }: { b: BuilderApi }) {
  const page = b.state.selection.page;
  const all = b.state.pages.get(page) ?? [];
  const picked = b.picked.map((id) => all.find((s) => s.id === id)).filter((s): s is Section => !!s);
  if (picked.length < 2) return null;
  const setAll = (patch: (s: Section) => Record<string, unknown>) =>
    b.applyAll(picked.map((s): Op => ({ kind: "page", page, op: { op: "update", id: s.id, set: patch(s) } })));
  const hidden = picked.every((s) => s.hidden);
  const pages = b.state.nav.filter((p) => p.slug !== page);

  return (
    <div
      role="toolbar"
      aria-label={`${picked.length} sections picked`}
      className="app-tokens bg-background text-foreground absolute inset-x-0 bottom-11 mx-auto flex w-fit items-center gap-0.5 rounded-lg border p-1 font-sans text-sm shadow-lg"
    >
      <span className="px-2 font-medium tabular-nums">{picked.length} sections</span>
      <span aria-hidden className="bg-border mx-0.5 h-5 w-px" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="xs" className="h-7">
            Ground <IconChevronDown className="opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" className="app-tokens">
          {GROUNDS.filter(([t]) => t !== "pattern" || b.view.theme.device).map(([tone, label]) => (
            <DropdownMenuItem key={tone} onSelect={() => setAll(() => ({ tone, background: null }))}>
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="xs" className="h-7">
            <IconArrowAutofitWidth /> Width <IconChevronDown className="opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" className="app-tokens">
          {WIDTHS.map(([width, I, label]) => (
            <DropdownMenuItem key={width} onSelect={() => setAll(() => ({ width }))}>
              <I /> {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="ghost" size="xs" className="h-7" onClick={() => setAll(() => ({ hidden: !hidden }))}>
        {hidden ? <IconEye /> : <IconEyeOff />} {hidden ? "Show" : "Hide"}
      </Button>
      {pages.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="xs" className="h-7">
              <IconFileArrowRight /> Move to <IconChevronDown className="opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" className="app-tokens max-h-72">
            <DropdownMenuLabel>Another page</DropdownMenuLabel>
            {pages.map((p) => (
              <DropdownMenuItem
                key={p.slug}
                onSelect={async () => {
                  // One after the other, in the page's order, so they land there in it.
                  for (const s of all.filter((x) => b.picked.includes(x.id))) await b.moveToPage(s.id, p.slug);
                }}
              >
                {p.title}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Button variant="ghost" size="xs" className="hover:text-destructive h-7" onClick={() => b.removeSections(picked.map((s) => s.id))}>
        <IconTrash /> Delete
      </Button>
      <span aria-hidden className="bg-border mx-0.5 h-5 w-px" />
      <Button variant="ghost" size="icon-xs" aria-label="Keep only the first one picked (Esc)" title="Keep only the first one picked (Esc)" onClick={b.unpickOthers}>
        <IconX />
      </Button>
    </div>
  );
}
