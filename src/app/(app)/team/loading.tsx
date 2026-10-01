import { PageSkeleton } from "@/components/skeletons";

/** A list's shape while the page streams in, not the library's grid. */
export default function Loading() {
  return <PageSkeleton body="list" width="4xl" />;
}
