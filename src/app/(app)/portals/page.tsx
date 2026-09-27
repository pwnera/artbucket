import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Portals, type Portal } from "@/components/portals";
import { can } from "@/lib/permissions";
import { get, sidebarData } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Portals" };

/** The workspace's brand portals, from /api/v1/portals like any client's. */
export default async function PortalsPage() {
  // Together: the API checks access itself, and a redirect drops what came back.
  const [sidebar, portals] = await Promise.all([sidebarData(), get("portals", (b: { data: Portal[] }) => b.data, [])]);
  if (!can(sidebar.me, "portal.manage")) redirect("/");
  return <Portals sidebar={sidebar} portals={portals} />;
}
