import { GridSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** The library's shell while the first listing streams in from the API. */
export default function Loading() {
  return (
    <div className="flex min-h-svh" role="status" aria-label="Loading library">
      <aside className="bg-sidebar hidden w-64 shrink-0 flex-col gap-6 border-r p-4 md:flex">
        <div className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-lg" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-8 w-full" />
        <div className="grid gap-3">
          <Skeleton className="h-3 w-20" />
          {[70, 55, 80].map((w) => (
            <Skeleton key={w} className="h-4" style={{ width: `${w}%` }} />
          ))}
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b px-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="ml-auto h-8 w-full max-w-sm" />
          <Skeleton className="h-8 w-20" />
        </header>
        <div className="grid gap-4 p-4 md:p-6">
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-24" />
          </div>
          <GridSkeleton />
        </div>
      </main>
    </div>
  );
}
