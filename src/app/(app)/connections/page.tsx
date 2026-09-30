import type { Metadata } from "next";
import { Agents, type Asked, type Key } from "@/components/agents";
import { env } from "@/lib/env";
import { get, whoami } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connections" };

/**
 * Connections: where a person connects an agent, sees the ones connected,
 * and, for whoever reads Insights, what each asked for. Keys come from
 * /api/v1/keys like any client's: every one for an admin, your own agents
 * for anyone else.
 */
export default async function ConnectionsPage() {
  const [keys, me, asked] = await Promise.all([
    get("keys", (b: { data: Key[] }) => b.data, []),
    whoami(),
    get("insights/connections", (b: { data: Asked }) => b.data, null),
  ]);
  return <Agents keys={keys} origin={env.APP_URL} anonymous={me.auth.anonymous} asked={asked} />;
}
