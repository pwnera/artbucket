import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder tiles shaped like AssetCard, so the grid doesn't jump when it fills. */
export function GridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <ul
      aria-hidden
      className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]"
    >
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="overflow-hidden rounded-xl border">
          <Skeleton className="aspect-square rounded-none" />
          <div className="grid gap-2 border-t px-3 py-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </li>
      ))}
    </ul>
  );
}
