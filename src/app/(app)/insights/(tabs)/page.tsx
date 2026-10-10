import type { Metadata } from "next";
import { Suspense } from "react";
import { InsightsBody } from "@/components/insights";
import { InsightsSkeleton, LATE } from "@/components/skeletons";
import { insights } from "./data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Insights" };

/** What the project's events say, from /api/v1/insights like any client's. */
export default function InsightsPage() {
  return (
    <Suspense
      fallback={
        <div role="status" aria-label="Loading" className={LATE}>
          <InsightsSkeleton />
        </div>
      }
    >
      <Tab />
    </Suspense>
  );
}

async function Tab() {
  return <InsightsBody data={await insights()} />;
}
