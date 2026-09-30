import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Insights, type InsightsData } from "@/components/insights";
import { can } from "@/lib/permissions";
import { get, whoami } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Use checks" };

/** Insights' Use checks tab: the use-check log, from /api/v1/insights like the Overview. */
export default async function UseChecksPage() {
  const [me, data] = await Promise.all([whoami(), get("insights", (b: { data: InsightsData }) => b.data, null)]);
  if (!can(me, "insights.read")) redirect("/");
  return <Insights data={data} tab="checks" />;
}
