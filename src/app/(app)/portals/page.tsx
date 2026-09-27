import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Portals, type Portal } from "@/components/portals";
import { can } from "@/lib/permissions";
import { get, sidebarData } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Portals - Artbucket" };

/** The workspace's brand portals, from /api/v1/portals like any client's. */
export default async function PortalsPage() {
  const sidebar = await sidebarData();
  if (!can(sidebar.me, "portal.manage")) redirect("/");
  const portals = await get("portals", (b: { data: Portal[] }) => b.data, []);
  return <Portals sidebar={sidebar} portals={portals} />;
}
