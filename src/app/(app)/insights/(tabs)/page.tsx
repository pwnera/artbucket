import type { Metadata } from "next";
import { Suspense } from "react";
import { InsightsBody } from "@/components/insights";
import { InsightsSkeleton, LATE } from "@/components/skeletons";
import { get } from "@/lib/sidebar";
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
  // Where a search gap's requested uploads may go (Request it).
  const [data, collections] = await Promise.all([insights(), get("collections", (b: { data: { id: string; name: string }[] }) => b.data, [])]);
  return <InsightsBody data={data} collections={collections} />;
}
