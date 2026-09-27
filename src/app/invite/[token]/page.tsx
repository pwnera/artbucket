import type { Metadata } from "next";
import type { Me } from "@/components/account";
import { InvitePage, type InvitationInfo } from "@/components/sign-in";
import { get } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invitation - Artbucket" };

/** Where an invitation link lands: what it offers, from /api/v1/invite/{token}. */
export default async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [info, me] = await Promise.all([
    get(`invite/${encodeURIComponent(token)}`, (b: { data: InvitationInfo }) => b.data, null),
    get("me", (b: { data: Me }) => b.data, null),
  ]);
  return <InvitePage token={token} info={info} me={me} />;
}
