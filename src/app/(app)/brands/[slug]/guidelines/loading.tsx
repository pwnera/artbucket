import { LATE, PageCanvasSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The Guidelines tab while it loads, shaped like it: the app's header, the
 * brand's one-line header (BrandHeader compact: mark, name, tabs, what is
 * live, actions), then the page on the canvas. Not the other tabs' header:
 * this one draws its own, so it isn't in their layout ((tabs)/layout.tsx).
 */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading guidelines" className={cn("flex min-w-0 flex-1 flex-col", LATE)}>
      <header className="flex h-14 items-center gap-3 border-b px-4">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="ml-auto h-8 w-28" />
      </header>
      <div className="flex h-12 items-center gap-2 border-b px-4 md:px-6">
        <Skeleton className="size-7 shrink-0 rounded-md" />
        <Skeleton className="h-4 w-24" />
        <div className="ms-2 hidden gap-3 lg:flex">
          {[14, 16, 24, 12, 14].map((w, i) => (
            <Skeleton key={i} className="h-3.5" style={{ width: `${w * 4}px` }} />
          ))}
        </div>
        <div className="ms-auto flex items-center gap-2">
          <Skeleton className="hidden h-4 w-24 sm:block" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="size-8 rounded-md" />
          ))}
        </div>
      </div>
      <PageCanvasSkeleton />
    </div>
  );
}
