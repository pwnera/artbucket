import type { Metadata } from "next";
import { Suspense } from "react";
import { InsightsBody } from "@/components/insights";
import { LATE, ListSkeleton } from "@/components/skeletons";
import { insights } from "../data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Use checks" };

/** Insights' Use checks tab: the use-check log, from /api/v1/insights like the Overview. */
export default function UseChecksPage() {
  return (
    <Suspense
      fallback={
        <div role="status" aria-label="Loading" className={LATE}>
          <ListSkeleton />
        </div>
      }
    >
      <Tab />
    </Suspense>
  );
}

async function Tab() {
  return <InsightsBody data={await insights()} tab="checks" />;
}
