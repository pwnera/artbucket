import type { Metadata } from "next";
import { ActivityFeed, type Page } from "@/components/activity";
import { get, whoami } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Activity" };

/** Who did what, from /api/v1/activity like any other client. */
export default async function ActivityPage() {
  // whoami: the layout's session check does not rerun on a soft navigation.
  const [first] = await Promise.all([get("activity", (b: Page) => b, { data: [], next: null } as Page), whoami()]);
  return <ActivityFeed first={first} />;
}
