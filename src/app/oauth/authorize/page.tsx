import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { Me } from "@/components/account";
import { Authorize } from "@/components/consent";
import { get } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connect an agent" };

/** Where a chat app (Claude, ChatGPT) sends a person to say what their agent may do (lib/core/oauth.ts). */
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const query = new URLSearchParams(await searchParams).toString();
  const me = await get("me", (b: { data: Me }) => b.data, null);
  if (!me?.user) redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${query}`)}`);
  return <Authorize query={query} />;
}
