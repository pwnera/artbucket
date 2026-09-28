import { Skeleton } from "@/components/ui/skeleton";

/**
 * The pane while a section loads. The menu, header and section title are the
 * layout's and stay drawn, so this is only a form's shape.
 */
export default function SectionLoading() {
  return (
    <div role="status" aria-label="Loading" className="grid max-w-2xl gap-6 rounded-lg border p-4 sm:p-5">
      <Skeleton className="h-4 w-32" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="grid gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
      <Skeleton className="h-9 w-24" />
    </div>
  );
}
