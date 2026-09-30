import { PageSkeleton } from "@/components/skeletons";

/** Insights while they load: rows, not the library's tiles. */
export default function Loading() {
  return <PageSkeleton body="list" />;
}
