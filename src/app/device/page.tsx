import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { Me } from "@/components/account";
import { Device } from "@/components/consent";
import { get } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connect the CLI - Artbucket" };

/** Where `artbucket login` sends a person to approve its code (lib/core/oauth.ts). */
export default async function DevicePage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  const me = await get("me", (b: { data: Me }) => b.data, null);
  if (!me?.user) redirect(`/login?next=${encodeURIComponent(`/device${code ? `?code=${encodeURIComponent(code)}` : ""}`)}`);
  return <Device code={code} />;
}
