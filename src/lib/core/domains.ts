import { randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { domains, portals } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { recordAudit } from "@/lib/core/audit";
import { AssetError } from "@/lib/core/errors";
import { env } from "@/lib/env";
import { can, needs } from "@/lib/permissions";
import { challengeName, hostname } from "@/lib/portal";

/**
 * Host names this server answers for besides APP_URL's: an organization's
 * own address for the whole app (white-labeling), or a portal's. Each is
 * proved by a TXT record before anything is served at it, or a TLS
 * certificate asked for it (GET /api/v1/domains/check). src/proxy.ts asks
 * on every request to another host, so lookups are cached.
 */

const appHost = new URL(env.APP_URL).host.replace(/:\d+$/, "");
const scheme = new URL(env.APP_URL).protocol;

type Target = { organizationId: string; portal: string | null };

// ponytail: per process, a minute stale at most: a domain verified on another instance takes that long to answer there.
let hostCache: { at: number; map: Map<string, Target> } | null = null;
export const forgetHosts = () => void (hostCache = null);

async function verified() {
  if (!hostCache || Date.now() - hostCache.at > 60_000) {
    const rows = await db
      .select({ host: domains.host, organizationId: domains.organizationId, portal: portals.slug })
      .from(domains)
      .leftJoin(portals, eq(portals.id, domains.portalId))
      .where(isNotNull(domains.verifiedAt))
      .orderBy(asc(domains.createdAt));
    hostCache = { at: Date.now(), map: new Map(rows.map((r) => [r.host, { organizationId: r.organizationId, portal: r.portal }])) };
  }
  return hostCache.map;
}

/** What a verified host serves: its organization, and the portal when it is a portal's. */
export async function hostTarget(rawHost: string): Promise<Target | null> {
  const host = hostname(rawHost);
  return host ? ((await verified()).get(host) ?? null) : null;
}

/** The portal a verified host name serves, for the proxy; null for any other host. */
export const portalAtHost = async (host: string) => (await hostTarget(host))?.portal ?? null;

/** Whether a browser origin is one of the app's own: APP_URL, or an organization's verified app domain. */
export async function isAppOrigin(origin: string) {
  if (origin === new URL(env.APP_URL).origin) return true;
  try {
    const t = await hostTarget(new URL(origin).host);
    return !!t && !t.portal;
  } catch {
    return false;
  }
}

/** Every verified app domain, as origins: better-auth's trusted origins. */
export async function appOrigins() {
  return [...(await verified())].filter(([, t]) => !t.portal).map(([host]) => `${scheme}//${host}`);
}

/** Where an organization's people use the app: its own verified domain, else APP_URL. For links in email. */
export async function appUrlFor(organizationId: string | null) {
  if (organizationId) {
    for (const [host, t] of await verified()) if (t.organizationId === organizationId && !t.portal) return `${scheme}//${host}`;
  }
  return env.APP_URL;
}

/** GET /api/v1/domains/check: whether a TLS certificate may be issued for this host (Caddy's on-demand ask). */
export async function domainAllowed(raw: string) {
  return !!(await hostTarget(raw));
}

// ---- claiming and proving -------------------------------------------------------

const newToken = () => `artbucket-${randomBytes(16).toString("hex")}`;

/** A host name for an organization's app (`portalId` null) or one of its portals; it serves nothing until proved. */
/** The host name `raw` means, if it may be claimed: refuses what isn't one, this server's own, and one in use. */
export async function claimable(raw: string) {
  const host = hostname(raw);
  if (!host) throw new AssetError("invalid", `Not a host name: "${raw}". Say assets.example.com`);
  if (host === appHost) throw new AssetError("invalid", "That is this server's own address");
  const [other] = await db.select().from(domains).where(eq(domains.host, host));
  if (other) throw new AssetError("conflict", `${host} is already in use here`);
  return host;
}

export async function claimHost(organizationId: string, portalId: string | null, raw: string) {
  const host = await claimable(raw);
  const [row] = await db.insert(domains).values({ host, organizationId, portalId, token: newToken() }).returning();
  forgetHosts();
  return row;
}

export async function releaseHost(host: string) {
  await db.delete(domains).where(eq(domains.host, host));
  forgetHosts();
}

/** Look for the TXT record now. A 422 names what was found instead. */
export async function proveHost(by: Caller, d: typeof domains.$inferSelect, detail: Record<string, unknown> = {}) {
  if (d.verifiedAt) return d;
  const found = await resolveTxt(challengeName(d.host)).then(
    (rs) => rs.map((r) => r.join("")),
    () => [] as string[],
  );
  if (!found.includes(d.token)) {
    throw new AssetError("invalid", `No TXT record ${challengeName(d.host)} holding ${d.token} yet. DNS can take a while to reach everyone`, { found });
  }
  const [row] = await db.update(domains).set({ verifiedAt: new Date() }).where(eq(domains.host, d.host)).returning();
  forgetHosts();
  await recordAudit(by, "domain.verified", d.host, detail);
  return row;
}

// ---- an organization's own ------------------------------------------------------

export const presentDomain = (d: typeof domains.$inferSelect, portal: string | null = null) => ({
  host: d.host,
  verified: !!d.verifiedAt,
  record: { type: "TXT" as const, name: challengeName(d.host), value: d.token },
  portal,
  url: `${scheme}//${d.host}`,
});

function mayManage(caller: Caller) {
  if (!can(caller, "organization.manage")) throw new AssetError("forbidden", `Domains take ${needs("organization.manage")}`);
}

/** The organization's domains: its app's, and its portals'. */
export async function listDomains(caller: Caller) {
  mayManage(caller);
  const rows = await db
    .select({ d: domains, portal: portals.slug })
    .from(domains)
    .leftJoin(portals, eq(portals.id, domains.portalId))
    .where(eq(domains.organizationId, caller.workspace.organizationId))
    .orderBy(asc(domains.createdAt));
  return rows.map((r) => presentDomain(r.d, r.portal));
}

/** An address of the organization's own for the whole app. */
export async function addDomain(caller: Caller, raw: string) {
  mayManage(caller);
  const d = await claimHost(caller.workspace.organizationId, null, raw);
  await recordAudit(caller, "domain.added", d.host);
  return presentDomain(d);
}

const ownApp = (caller: Caller, host: string) =>
  and(eq(domains.host, hostname(host) ?? ""), eq(domains.organizationId, caller.workspace.organizationId), isNull(domains.portalId));

export async function verifyAppDomain(caller: Caller, host: string) {
  mayManage(caller);
  const [d] = await db.select().from(domains).where(ownApp(caller, host));
  return d ? presentDomain(await proveHost(caller, d)) : null;
}

/** Stop answering at an app domain. A portal's goes with the portal, or by clearing it there. */
export async function removeDomain(caller: Caller, host: string) {
  mayManage(caller);
  const [d] = await db.select().from(domains).where(ownApp(caller, host));
  if (!d) return false;
  await releaseHost(d.host);
  await recordAudit(caller, "domain.removed", d.host);
  return true;
}
