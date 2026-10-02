import { GridSkeleton, LATE } from "@/components/skeletons";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * A page of the app while it streams in, for those without a loading of
 * their own (the library has one: (library)/loading.tsx). Shaped like the
 * library's pane: header, tabs, title, filters, tiles. The frame around it
 * stays (components/shell.tsx).
 */
export default function Loading() {
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col", LATE)} role="status" aria-label="Loading library">
      <header className="flex h-14 items-center gap-3 border-b px-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="ml-auto h-8 w-40 sm:w-64" />
        <Skeleton className="h-8 w-20" />
      </header>
      <div className="flex flex-col gap-4 px-4 pb-4 md:px-6 md:pb-6">
        <div className="-mx-4 flex gap-5 border-b px-4 py-3 md:-mx-6 md:px-6">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="grid gap-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="flex gap-2 py-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="ml-auto h-8 w-16" />
        </div>
        <GridSkeleton />
      </div>
    </div>
  );
}
