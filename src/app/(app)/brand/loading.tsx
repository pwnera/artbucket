import { Skeleton } from "@/components/ui/skeleton";

/**
 * The guidelines' pane while the rules load, drawn from the page's own
 * classes (brand-editor.tsx) so nothing moves when they land: the header's
 * icon buttons, the cover and its palette strip, a section and its rules.
 * The sidebar stays.
 */
export default function Loading() {
  return (
    <div className="flex min-w-0 flex-1 flex-col" role="status" aria-label="Loading guidelines">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <Skeleton className="h-4 w-32" />
        <div className="ml-auto flex items-center gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="size-8 rounded-md" />
          ))}
        </div>
      </header>
      <div aria-hidden className="mx-auto w-full max-w-4xl space-y-16 px-4 pt-10 sm:px-8 sm:pt-14">
        <div className="space-y-8">
          <div className="flex items-center gap-4">
            <Skeleton className="size-16 shrink-0 rounded-2xl" />
            <div className="grid min-w-0 gap-2">
              <Skeleton className="h-9 w-56 max-w-full" />
              <Skeleton className="h-4 w-72 max-w-full" />
            </div>
          </div>
          <Skeleton className="h-12 rounded-xl" />
        </div>
        <div>
          <div className="mb-6 flex items-center gap-3 border-b pb-5">
            <Skeleton className="size-10 shrink-0 rounded-xl" />
            <Skeleton className="h-7 w-40" />
          </div>
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-24" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
