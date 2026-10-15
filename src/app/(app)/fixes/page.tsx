import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Fixes, type FixesData } from "@/components/fixes";
import { env } from "@/lib/env";
import { can } from "@/lib/permissions";
import { get, whoami } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fixes" };

/** What needs doing in the project, from /api/v1/fixes like any client's; for Insights' readers. With FIX_ISSUE_URL, each place and search can become an issue there. */
export default async function FixesPage() {
  // Together: the API checks access itself, and a redirect drops what came back.
  const [me, data, collections] = await Promise.all([
    whoami(),
    get("fixes", (b: { data: FixesData }) => b.data, null),
    // Where a requested search's uploads may go (Request it).
    get("collections", (b: { data: { id: string; name: string }[] }) => b.data, []),
  ]);
  if (!can(me, "insights.read")) redirect("/");
  return <Fixes data={data} collections={collections} issueUrl={env.FIX_ISSUE_URL ?? null} />;
}
