import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ShareLink } from "@/components/share-dialog";
import { Team, type AuditPage, type Members } from "@/components/team";
import { get, sidebarData } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Team - Artbucket" };

/**
 * People, share links and the audit log, each from /api/v1 like any client's:
 * a tab shows when the API answers it (members and audit for admins, share
 * links for anyone who may share).
 */
export default async function TeamPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [sidebar, members, shares, audit, { tab }] = await Promise.all([
    sidebarData(),
    get("members", (b: Members) => b, null),
    get("shares", (b: { data: ShareLink[] }) => b.data, null),
    get("audit", (b: AuditPage) => b, null),
    searchParams,
  ]);
  if (!members && !shares && !audit) redirect("/");
  return <Team sidebar={sidebar} tab={tab ?? "people"} members={members} shares={shares} audit={audit} />;
}
