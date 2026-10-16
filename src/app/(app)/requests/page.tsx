import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RequestsPage } from "@/components/requests-page";
import { can } from "@/lib/permissions";
import { whoami } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Requests" };

/** What visitors asked of the project's sites, in the Inbox: whoever may manage sites answers them here. */
export default async function Requests() {
  const me = await whoami();
  if (!can(me, "portal.manage")) redirect("/review");
  return <RequestsPage />;
}
