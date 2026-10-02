import { LATE } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * A brand's page while it loads, shaped like its header (components/brand-header.tsx):
 * the mark and name, the actions, the tabs, then the page. Not the library's tiles.
 */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading the brand" className={cn("flex min-w-0 flex-1 flex-col", LATE)}>
      <header className="flex h-14 items-center gap-3 border-b px-4">
        <Skeleton className="h-4 w-32" />
      </header>
      <div className="mx-auto flex w-full max-w-5xl items-center gap-3.5 px-4 pt-6 md:px-6">
        <Skeleton className="size-12 shrink-0 rounded-xl" />
        <div className="grid flex-1 gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="hidden h-8 w-20 sm:block" />
        <Skeleton className="hidden h-8 w-24 sm:block" />
      </div>
      <div className="mx-auto mt-4 flex w-full max-w-5xl gap-4 border-b px-4 pb-3 md:px-6">
        {[16, 20, 14, 18, 16].map((w, i) => (
          <Skeleton key={i} className="h-4" style={{ width: `${w * 4}px` }} />
        ))}
      </div>
      <div className="mx-auto grid w-full max-w-5xl gap-4 px-4 pt-6 md:grid-cols-3 md:px-6">
        <Skeleton className="h-40 rounded-xl md:col-span-2" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-32 rounded-xl md:col-span-3" />
      </div>
    </div>
  );
}
