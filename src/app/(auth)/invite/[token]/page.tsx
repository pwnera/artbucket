import type { Metadata } from "next";
import type { Me } from "@/components/account";
import { InvitePage, type InvitationInfo } from "@/components/sign-in";
import { get } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invitation" };

/**
 * Where an invitation link lands: what it offers, from /api/v1/invite/{token}.
 * Single sign-on comes back with `accept` (an account that existed: accept
 * it now) or `error`.
 */
export default async function Invite({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ accept?: string; error?: string }>;
}) {
  const { token } = await params;
  const { accept, error } = await searchParams;
  const [info, me] = await Promise.all([
    get(`invite/${encodeURIComponent(token)}`, (b: { data: InvitationInfo }) => b.data, null),
    get("me", (b: { data: Me }) => b.data, null),
  ]);
  return <InvitePage token={token} info={info} me={me} accept={accept === "1"} error={!!error} />;
}
