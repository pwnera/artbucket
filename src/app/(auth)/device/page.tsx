import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { Me } from "@/components/account";
import { Device, type Loaded } from "@/components/consent";
import { get, getBody } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connect the CLI" };

/** Where `artbucket login` sends a person to approve its code (lib/core/oauth.ts). A code in the link is looked up here, so the first frame is the choice. */
export default async function DevicePage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  const me = await get("me", (b: { data: Me }) => b.data, null);
  if (!me?.user) redirect(`/login?next=${encodeURIComponent(`/device${code ? `?code=${encodeURIComponent(code)}` : ""}`)}`);
  const initial = code ? await getBody<NonNullable<Loaded>>(`oauth/device/${encodeURIComponent(code)}`) : undefined;
  return <Device code={code} initial={initial} email={me.user.email} />;
}
