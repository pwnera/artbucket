import { LATE } from "@/components/skeletons";
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
      <header className="flex h-14 items-center gap-2 border-b px-4">
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
    </div>
  );
}
