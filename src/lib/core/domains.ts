import { eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { domains, portals } from "@/lib/db/schema";
import { hostname } from "@/lib/portal";

/**
 * Host names this server answers for besides APP_URL's (lib/db/schema.ts
 * `domains`). Kept apart from lib/core/portals.ts: src/proxy.ts asks on
 * every request to another host, and needs only this.
 */

/** GET /api/v1/domains/check: whether a TLS certificate may be issued for this host (Caddy's on-demand ask). */
export async function domainAllowed(raw: string) {
  const host = hostname(raw);
  if (!host) return false;
  const [d] = await db.select({ ok: domains.verifiedAt }).from(domains).where(eq(domains.host, host));
  return !!d?.ok;
}

// ponytail: per process, a minute stale at most: a domain added on another instance takes that long to answer there.
let hostCache: { at: number; map: Map<string, string> } | null = null;
export const forgetHosts = () => void (hostCache = null);

/** The portal a verified host name serves, for the proxy (src/proxy.ts); null for any other host. */
export async function portalAtHost(rawHost: string): Promise<string | null> {
  if (!hostCache || Date.now() - hostCache.at > 60_000) {
    const rows = await db
      .select({ host: domains.host, slug: portals.slug })
      .from(domains)
      .innerJoin(portals, eq(portals.id, domains.portalId))
      .where(isNotNull(domains.verifiedAt));
    hostCache = { at: Date.now(), map: new Map(rows.map((r) => [r.host, r.slug])) };
  }
  const host = hostname(rawHost);
  return (host && hostCache.map.get(host)) ?? null;
}
