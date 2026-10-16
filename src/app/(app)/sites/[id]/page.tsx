import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PortalPage, type Portal } from "@/components/portals";
import { ExternalSitePage } from "@/components/site-deployments";
import { env } from "@/lib/env";
import { can } from "@/lib/permissions";
import { get, whoami } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Site" };

/** A portal's settings, or an external site's details, as a page of their own, from /api/v1/sites like any client's; a built site's are its deployments, on Sites. */
export default async function SitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [me, portals] = await Promise.all([whoami(), get("sites", (b: { data: Portal[] }) => b.data, [])]);
  if (!can(me, "portal.manage")) redirect("/");
  const portal = portals.find((p) => p.id === id || p.slug === id);
  if (!portal) notFound();
  if (portal.kind === "external") return <ExternalSitePage site={portal} />;
  if (portal.kind !== "portal") redirect(`/sites?deployments=${portal.id}`);
  return <PortalPage portal={portal} portalDomain={env.PORTAL_DOMAIN} />;
}
