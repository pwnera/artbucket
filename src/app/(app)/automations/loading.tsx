import { PageSkeleton } from "@/components/skeletons";

/** Automations while they load: their list, where it lands. */
export default function Loading() {
  return <PageSkeleton body="list" width="4xl" />;
}
