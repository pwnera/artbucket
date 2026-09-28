import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { AuditPage, Members } from "@/components/settings/access";
import type { ShareLink } from "@/components/share-dialog";
import { Team } from "@/components/team";
import { get, whoami } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Team" };

/**
 * People and invitations, share and upload links, and the audit log, each
 * from /api/v1 like any client's, each only for whoever may. `?invite` opens
 * Invite people; `?tab=` picks the tab.
 */
export default async function TeamPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  // All at once: each endpoint checks access itself, and what someone may not see comes back null.
  const [params, members, shares, audit] = await Promise.all([
    searchParams,
    get("members", (b: Members) => b, null),
    get("shares", (b: { data: ShareLink[] }) => b.data, null),
    get("audit", (b: AuditPage) => b, null),
    // The layout's session check does not rerun on a soft navigation: a lapsed session goes to /login, not /.
    whoami(),
  ]);
  if (!members && !shares && !audit) redirect("/");
  return <Team tab={params.tab ?? "people"} members={members} shares={shares} audit={audit} />;
}
