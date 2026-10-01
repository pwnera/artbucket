import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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

function FormSkeleton() {
  return (
    <div aria-hidden className="grid max-w-2xl gap-6">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="grid gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
      <Skeleton className="h-9 w-24" />
    </div>
  );
}

/** A skeleton that waits a moment before showing: a page that arrives quickly never flashes one. */
export const LATE = "animate-in fade-in-0 delay-150 duration-300 fill-mode-backwards";

/**
 * The content pane while a page streams in: its header and a body shaped
 * like what arrives. The frame (sidebar) stays mounted, so it isn't drawn.
 */
export function PageSkeleton({ body }: { body: "list" | "form" | "grid" }) {
  return (
    <div role="status" aria-label="Loading" className={cn("flex min-w-0 flex-1 flex-col", LATE)}>
      <header className="flex h-14 items-center gap-3 border-b px-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="ml-auto h-8 w-20" />
      </header>
      <div className="grid gap-6 p-4 md:p-6">
        <Skeleton className="h-6 w-48" />
        {body === "list" ? <ListSkeleton /> : body === "form" ? <FormSkeleton /> : <GridSkeleton />}
      </div>
    </div>
  );
}
