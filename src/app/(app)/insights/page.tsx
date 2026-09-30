import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Insights, type InsightsData } from "@/components/insights";
import { can } from "@/lib/permissions";
import { get, whoami } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Insights" };

/** What the workspace's events say, from /api/v1/insights like any client's. */
export default async function InsightsPage() {
  // Together: the API checks access itself, and a redirect drops what came back.
  const [me, data] = await Promise.all([whoami(), get("insights", (b: { data: InsightsData }) => b.data, null)]);
  if (!can(me, "insights.read")) redirect("/");
  return <Insights data={data} />;
}
