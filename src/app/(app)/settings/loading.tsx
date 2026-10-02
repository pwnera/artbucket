import { SectionSkeleton } from "@/components/skeletons";

/**
 * The pane while Settings opens; the menu, header and section title are the
 * layout's and stay drawn. Moving between sections doesn't come here: this
 * boundary's child, the (sections) group, stays the same, so the section on
 * show stays until the next one's page streams in behind its own Suspense.
 */
export default function SettingsLoading() {
  return <SectionSkeleton />;
}
