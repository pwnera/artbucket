import type { Metadata } from "next";
import { Agents, type Key } from "@/components/agents";
import { env } from "@/lib/env";
import { get, sidebarData } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Agents - Artbucket" };

/**
 * Where a person gives an agent its key and the one command that connects
 * it. Keys come from /api/v1/keys like any client's; listing them needs the
 * admin scope, so without it the page says so instead.
 */
export default async function AgentsPage() {
  const [keys, sidebar] = await Promise.all([get("keys", (b: { data: Key[] }) => b.data, null), sidebarData()]);
  return <Agents keys={keys} sidebar={sidebar} origin={env.APP_URL} anonymous={env.ANONYMOUS_SCOPE} />;
}
