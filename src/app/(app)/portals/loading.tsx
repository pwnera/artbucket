import { PageSkeleton } from "@/components/skeletons";

/** The portals list while it loads: rows, not the library's tiles. */
export default function Loading() {
  return <PageSkeleton body="list" />;
}
