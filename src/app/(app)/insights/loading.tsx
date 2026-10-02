import { PageSkeleton } from "@/components/skeletons";

/** Insights while they load: its figures, its chart and its breakdowns, where they land. */
export default function Loading() {
  return <PageSkeleton body="insights" width="6xl" />;
}
