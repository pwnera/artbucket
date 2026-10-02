import { Skeleton } from "@/components/ui/skeleton";

/**
 * The library grid's columns, shared with its skeleton so neither jumps:
 * tiles of `--tile` (180px), but never fewer than two across on a phone.
 */
export const GRID_COLS =
  "[grid-template-columns:repeat(auto-fill,minmax(min(var(--tile,180px),calc(50%-0.25rem)),1fr))] gap-2 sm:gap-4";

/** Placeholder tiles shaped like AssetCard, so the grid doesn't jump when it fills. */
export function GridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <ul aria-hidden className={`grid ${GRID_COLS}`}>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="overflow-hidden rounded-xl border">
          <Skeleton className="aspect-square rounded-none" />
          <div className="grid gap-2 border-t px-3 py-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Rows of a thumb and two lines: people, keys, activity, versions. */
export function ListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul aria-hidden className="grid gap-4">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="flex items-center gap-3">
          <Skeleton className="size-10 shrink-0 rounded-md" />
          <div className="grid flex-1 gap-2">
            {/* Varied widths read as text, not as bars. */}
            <Skeleton className="h-4" style={{ width: `${[60, 45, 70, 50][i % 4]}%` }} />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** A skeleton that waits a moment before showing: a page that arrives quickly never flashes one. */
export const LATE = "animate-in fade-in-0 delay-150 duration-300 fill-mode-backwards";

/** A guidelines page on the canvas: its header, then sections of cards. */
export function PageCanvasSkeleton() {
  return (
    <div aria-hidden className="mx-auto w-full max-w-4xl space-y-14 px-4 pt-12">
      <div className="grid gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-72 max-w-full" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="grid gap-4">
          <Skeleton className="h-6 w-40" />
          <div className="grid grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((j) => (
              <Skeleton key={j} className="h-24 rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
