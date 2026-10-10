import { AppHeader, LibraryTabs } from "@/components/page";
import { GridSkeleton, LATE } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The library while its listing streams in. Its header and tabs are the
 * real ones, drawn at once where the page draws them (components/gallery.tsx),
 * so coming from Activity the tabs don't blink; only the title, filters and
 * tiles wait, as skeletons.
 */
export default function Loading() {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <AppHeader trail={[{ label: "Explore" }]} />
      <div className="flex min-w-0 flex-1 flex-col gap-4 px-4 pb-4 md:px-6 md:pb-6">
        <LibraryTabs />
        <div role="status" aria-label="Loading library" className={`flex flex-col gap-4 ${LATE}`}>
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
    </div>
  );
}
