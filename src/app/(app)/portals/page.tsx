import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Portals, type Portal } from "@/components/portals";
import { env } from "@/lib/env";
import { can } from "@/lib/permissions";
import { get, whoami } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Portals" };

/** The workspace's brand portals, from /api/v1/portals like any client's. */
export default async function PortalsPage() {
  // Together: the API checks access itself, and a redirect drops what came back.
  const [me, portals] = await Promise.all([whoami(), get("portals", (b: { data: Portal[] }) => b.data, [])]);
  if (!can(me, "portal.manage")) redirect("/");
  return <Portals portals={portals} portalDomain={env.PORTAL_DOMAIN} />;
}
