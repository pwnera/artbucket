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

/** Brand cards: a ground with a mark, then a name and a line. */
function CardsSkeleton() {
  return (
    <ul aria-hidden className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="grid gap-2">
          <Skeleton className="aspect-[16/10] rounded-xl" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </li>
      ))}
    </ul>
  );
}

/** Insights: a row of figures, the chart under them, then two breakdowns. */
function InsightsSkeleton() {
  return (
    <div aria-hidden className="grid gap-4">
      <div className="grid overflow-hidden rounded-xl border">
        <div className="grid grid-cols-2 border-b sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="grid gap-2 p-4">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-6 w-20" />
            </div>
          ))}
        </div>
        <Skeleton className="m-4 h-56 rounded-md" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  );
}

/**
 * The content pane while a page streams in: its header and a body shaped
 * like what arrives. The frame (sidebar) stays mounted, so it isn't drawn.
 * `width`: the page is a centered column of that width under a PageHeader
 * (team, portals, brands, insights), so the skeleton sits where it lands.
 */
export function PageSkeleton({ body, width }: { body: "list" | "form" | "grid" | "cards" | "insights"; width?: "4xl" | "6xl" }) {
  const shape =
    body === "list" ? <ListSkeleton /> : body === "form" ? <FormSkeleton /> : body === "cards" ? <CardsSkeleton /> : body === "insights" ? <InsightsSkeleton /> : <GridSkeleton />;
  return (
    <div role="status" aria-label="Loading" className={cn("flex min-w-0 flex-1 flex-col", LATE)}>
      <header className="flex h-14 items-center gap-3 border-b px-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="ml-auto h-8 w-20" />
      </header>
      {width ? (
        <div className={cn("mx-auto flex w-full flex-col gap-6 px-4 pt-6 pb-16 md:px-6", width === "4xl" ? "max-w-4xl" : "max-w-6xl")}>
          <div className="grid gap-2">
            <div className="flex items-center gap-2.5">
              <Skeleton className="size-5 rounded" />
              <Skeleton className="h-6 w-40" />
            </div>
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          {shape}
        </div>
      ) : (
        <div className="grid gap-6 p-4 md:p-6">
          <Skeleton className="h-6 w-48" />
          {shape}
        </div>
      )}
    </div>
  );
}
