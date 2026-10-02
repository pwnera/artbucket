import { redirect } from "next/navigation";
import { InsightsFrame } from "@/components/insights";
import { can } from "@/lib/permissions";
import { whoami } from "@/lib/sidebar";
import { insights } from "./data";

/**
 * Insights' header and tabs, which stay while a tab changes: each tab streams
 * its body in under them, behind its own Suspense placeholder. ../loading.tsx
 * is for coming to Insights.
 */
export default async function InsightsLayout({ children }: { children: React.ReactNode }) {
  // Together: the API checks access itself, and a redirect drops what came back.
  const [me, data] = await Promise.all([whoami(), insights()]);
  if (!can(me, "insights.read")) redirect("/");
  return <InsightsFrame refused={data?.checks.refused}>{children}</InsightsFrame>;
}
