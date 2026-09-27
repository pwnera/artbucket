import type { Metadata } from "next";
import { Agents, type Key } from "@/components/agents";
import { env } from "@/lib/env";
import { get, sidebarData } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Agents" };

/**
 * Where a person connects an agent, and sees the ones connected. Keys come
 * from /api/v1/keys like any client's: every one for an admin, your own
 * agents for anyone else.
 */
export default async function AgentsPage() {
  const [keys, sidebar] = await Promise.all([get("keys", (b: { data: Key[] }) => b.data, []), sidebarData()]);
  return <Agents keys={keys} sidebar={sidebar} origin={env.APP_URL} anonymous={sidebar.me.auth.anonymous} />;
}
