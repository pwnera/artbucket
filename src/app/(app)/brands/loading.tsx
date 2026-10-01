import { PageSkeleton } from "@/components/skeletons";

/** The brands while they load: their cards, where they land. */
export default function Loading() {
  return <PageSkeleton body="cards" width="6xl" />;
}
