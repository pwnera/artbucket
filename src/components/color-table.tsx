import { IconCheck, IconX } from "@/components/icons";
import { grade } from "@/lib/color";
import type { Cell, ColorRow } from "@/lib/color-table";
import { kebab } from "@/lib/tokens";
import { cn } from "@/lib/utils";

/**
 * A row of the Rules tab's color table (lib/color-table.ts): the token's
 * name, its light value and its dark one, each a swatch, its hex and, for
 * text, its contrast on its ground. On a phone the name sits over the two,
 * and a contrast that has no room beside its hex wraps under it.
 */
export const COLOR_COLS = "grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_minmax(0,1fr)] sm:items-center";

/** The columns' names; each cell also says its own to a screen reader. */
export function ColorHead() {
  return (
    <div aria-hidden className={cn(COLOR_COLS, "text-muted-foreground text-xs font-medium")}>
      <span className="hidden sm:block">Name</span>
      <span>Light</span>
      <span>Dark</span>
    </div>
  );
}

/** `color.nightInk` reads night-ink, as its token does; a heading of its own goes under it. */
export function ColorCells({ row, label }: { row: ColorRow; label?: string | null }) {
  return (
    <span className={COLOR_COLS}>
      <span className="col-span-2 grid min-w-0 sm:col-span-1" title={row.key}>
        <code className="truncate font-mono text-sm">{kebab(row.key.slice(row.key.indexOf(".") + 1))}</code>
        {label && <span className="text-muted-foreground truncate text-xs">{label}</span>}
      </span>
      <Swatch cell={row.light} theme="Light" />
      <Swatch cell={row.dark} theme="Dark" />
    </span>
  );
}

function Swatch({ cell, theme }: { cell: Cell; theme: string }) {
  const g = cell.ratio === null ? null : grade(cell.ratio);
  return (
    <span className="bg-background flex min-h-8 min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border px-2 py-1 text-sm" title={cell.hex}>
      <span aria-hidden className="size-4 shrink-0 rounded-sm ring-1 ring-black/10 dark:ring-white/15" style={{ background: cell.hex }} />
      <span className="sr-only">{theme}: </span>
      {cell.own ? <span className="shrink-0 font-mono">{cell.hex.toUpperCase()}</span> : <span className="text-muted-foreground min-w-0">Inherits Light</span>}
      {g && (
        <span
          title={`${g === "fail" ? "Fails" : g} as text on its ground`}
          className={cn(
            "ms-auto flex shrink-0 items-center gap-0.5 text-xs tabular-nums",
            g === "fail" ? "text-destructive" : g === "AA large" ? "text-warning" : "text-muted-foreground",
          )}
        >
          {g === "fail" ? <IconX aria-hidden className="size-3" /> : <IconCheck aria-hidden className="size-3" />}
          {cell.ratio!.toFixed(1)}:1
          <span className="sr-only">, {g === "fail" ? "fails as text" : g}</span>
        </span>
      )}
    </span>
  );
}
