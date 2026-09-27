import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { AuditPage, Members } from "@/components/settings/access";
import type { ShareLink } from "@/components/share-dialog";
import { Team } from "@/components/team";
import { get, sidebarData } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Team" };

/**
 * People and invitations, share and upload links, and the audit log, each
 * from /api/v1 like any client's, each only for whoever may. `?invite` opens
 * Invite people; `?tab=` picks the tab.
 */
export default async function TeamPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  // All at once: each endpoint checks access itself, and what someone may not see comes back null.
  const [sidebar, params, members, shares, audit] = await Promise.all([
    sidebarData(),
    searchParams,
    get("members", (b: Members) => b, null),
    get("shares", (b: { data: ShareLink[] }) => b.data, null),
    get("audit", (b: AuditPage) => b, null),
  ]);
  if (!members && !shares && !audit) redirect("/");
  return <Team sidebar={sidebar} tab={params.tab ?? "people"} members={members} shares={shares} audit={audit} inviting={"invite" in params} />;
}
