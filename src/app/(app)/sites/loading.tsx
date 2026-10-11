import { PageSkeleton } from "@/components/skeletons";

/** The sites list while it loads: rows, not the library's tiles. */
export default function Loading() {
  return <PageSkeleton body="list" width="4xl" />;
}
