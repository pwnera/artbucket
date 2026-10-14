import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Automations, type AutomationRow } from "@/components/automations";
import { brands, get, whoami } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Automations" };

/** The project's automations and whose releases they may follow, from /api/v1 like any client's; for its admins, who alone may see them. */
export default async function AutomationsPage() {
  // Together: the API checks access itself, and a redirect drops what came back.
  const [list, brandList] = await Promise.all([get("automations", (b: { data: AutomationRow[] }) => b.data, null), brands(), whoami()]);
  if (!list) redirect("/");
  return <Automations automations={list} brands={brandList} />;
}
