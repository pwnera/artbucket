import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { AuditPage, Members } from "@/components/settings/access";
import type { ShareLink } from "@/components/share-dialog";
import { Team } from "@/components/team";
import { can } from "@/lib/permissions";
import { get, sidebarData } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Team" };

/**
 * People and invitations, share and upload links, and the audit log, each
 * from /api/v1 like any client's, each only for whoever may. `?invite` opens
 * Invite people; `?tab=` picks the tab.
 */
export default async function TeamPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const [sidebar, params] = await Promise.all([sidebarData(), searchParams]);
  const me = sidebar.me;
  const [members, shares, audit] = await Promise.all([
    can(me, "member.manage") ? get("members", (b: Members) => b, null) : null,
    can(me, "share.manage") ? get("shares", (b: { data: ShareLink[] }) => b.data, null) : null,
    can(me, "audit.read") ? get("audit", (b: AuditPage) => b, null) : null,
  ]);
  if (!members && !shares && !audit) redirect("/");
  return <Team sidebar={sidebar} tab={params.tab ?? "people"} members={members} shares={shares} audit={audit} inviting={"invite" in params} />;
}
