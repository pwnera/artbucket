import { LATE, PageCanvasSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The guidelines' pane while the brand loads, shaped like the builder: its
 * bar of page tabs and tools, then the page on the canvas, a header and its
 * sections. The sidebar stays.
 */
export default function Loading() {
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col", LATE)} role="status" aria-label="Loading guidelines">
      <header className="flex h-12 items-center gap-2 border-b px-3">
        {[20, 16, 24, 18].map((w, i) => (
          <Skeleton key={i} className="h-5" style={{ inlineSize: `${w * 0.25}rem` }} />
        ))}
        <div className="ms-auto flex items-center gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="size-8 rounded-md" />
          ))}
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      </header>
      <PageCanvasSkeleton />
    </div>
  );
}
