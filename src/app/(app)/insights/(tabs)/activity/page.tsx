import type { Metadata } from "next";
import { ActivityFeed, type Page } from "@/components/activity";
import { get } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Activity · Insights" };

/** Insights' Activity tab: who did what, from /api/v1/activity like any other client. */
export default async function ActivityTab() {
  const first = await get("activity", (b: Page) => b, { data: [], next: null } as Page);
  return <ActivityFeed first={first} />;
}
