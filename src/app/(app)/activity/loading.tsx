import { AppHeader, LibraryTabs } from "@/components/page";
import { LATE, ListSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Activity while its feed streams in. Its header and the library's tabs are
 * the real ones, where the page draws them (components/activity.tsx), so
 * coming from Assets the tabs don't blink; the title and rows wait.
 */
export default function Loading() {
  return (
    <>
      <AppHeader trail={[{ label: "Assets", href: "/" }, { label: "Activity" }]} />
      <div className="flex flex-1 flex-col gap-4 px-4 pb-10 md:px-6">
        <LibraryTabs at="activity" />
        <div role="status" aria-label="Loading activity" className={`flex flex-col gap-4 ${LATE}`}>
          <div className="flex items-center gap-3">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="ml-auto h-8 w-40" />
          </div>
          <ListSkeleton />
        </div>
      </div>
    </>
  );
}
