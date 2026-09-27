import { Skeleton } from "@/components/ui/skeleton";

/** The guidelines' shell while the rules load: sidebar, header, a cover, a section. */
export default function Loading() {
  return (
    <div className="flex min-h-svh" role="status" aria-label="Loading guidelines">
      <aside className="bg-sidebar hidden w-64 shrink-0 flex-col gap-6 border-r p-4 md:flex">
        <div className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-lg" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="grid gap-3">
          {[60, 45, 75].map((w) => (
            <Skeleton key={w} className="h-4" style={{ width: `${w}%` }} />
          ))}
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b px-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="ml-auto h-8 w-28" />
        </header>
        <div className="mx-auto w-full max-w-4xl space-y-8 px-4 pt-14 sm:px-8">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-12 w-2/3" />
          <Skeleton className="h-5 w-full max-w-xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-32 w-full" />
        </div>
      </main>
    </div>
  );
}
