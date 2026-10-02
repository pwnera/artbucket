import type { Metadata } from "next";
import { Agents, type Asked, type Key, type Kept } from "@/components/agents";
import type { Source } from "@/components/builder/use-status";
import { env } from "@/lib/env";
import { gitLink } from "@/lib/git";
import { brands, get, whoami } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connections" };

/**
 * Connections: where a person connects an agent, sees the ones connected,
 * and, for whoever reads Insights, what each asked for. Keys come from
 * /api/v1/keys like any client's: every one for an admin, your own agents
 * for anyone else. Below, the brands kept in a Git repository, each with
 * its way to the integration's page for it.
 */
export default async function ConnectionsPage() {
  const [keys, me, asked, list] = await Promise.all([
    get("keys", (b: { data: Key[] }) => b.data, []),
    whoami(),
    get("insights/connections", (b: { data: Asked }) => b.data, null),
    brands(),
  ]);
  // ponytail: a call a brand, fine for the handful a workspace has; a brands list with its source past that.
  const kept = (
    await Promise.all(
      list.map(async (brand) => ({
        brand,
        ...(await get(
          `brands/${encodeURIComponent(brand.slug)}/source`,
          (b: { data: Source }) => b.data,
          null,
        )),
      })),
    )
  ).filter((k): k is Kept => !!k.source);
  return (
    <Agents
      keys={keys}
      origin={env.APP_URL}
      anonymous={me.auth.anonymous}
      asked={asked}
      kept={kept}
      connect={me.git ? gitLink(me.git) : null}
    />
  );
}
