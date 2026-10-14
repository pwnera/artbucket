import { PageSkeleton } from "@/components/skeletons";

/** Templates while they load: the card and the downloads, where they land. */
export default function Loading() {
  return <PageSkeleton body="form" width="4xl" />;
}
