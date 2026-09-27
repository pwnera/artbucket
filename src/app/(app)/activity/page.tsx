import type { Metadata } from "next";
import { ActivityFeed, type Page } from "@/components/activity";
import { get, sidebarData } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Activity - Artbucket" };

/** Who did what, from /api/v1/activity like any other client. */
export default async function ActivityPage() {
  const [first, sidebar] = await Promise.all([
    get("activity", (b: Page) => b, { data: [], next: null } as Page),
    sidebarData(),
  ]);
  return <ActivityFeed first={first} sidebar={sidebar} />;
}
