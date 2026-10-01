import { randomBytes } from "node:crypto";
import { resolve4, resolve6, resolveCname, resolveTxt } from "node:dns/promises";
import { and, asc, desc, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { domains, portalAliases, portals, workspaces } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { recordAudit } from "@/lib/core/audit";
import { AssetError } from "@/lib/core/errors";
import { checkLimit } from "@/lib/core/usage";
import { env } from "@/lib/env";
import { can, needs } from "@/lib/permissions";
import { challengeName, hostname, slugAtHost, subdomainRefusal, underDomain } from "@/lib/portal";

/**
 * Host names this server answers for besides APP_URL's: an organization's
 * own, added in its settings. Each serves the whole app (white-labeling), the
 * `primary` one being where links in email point, or one of its portals,
 * which picks it from these. Each is proved by a TXT record, and by pointing
 * at the server when it says where (DOMAIN_TARGET), before anything is served
 * at it or a TLS certificate asked for it (GET /api/v1/domains/check).
 * src/proxy.ts asks on every request to another host, so lookups are cached.
 * With PORTAL_DOMAIN set, {slug}.PORTAL_DOMAIN serves that portal too, with
 * nothing to claim: the server owns the domain.
 */

const appHost = new URL(env.APP_URL).host.replace(/:\d+$/, "");
const scheme = new URL(env.APP_URL).protocol;

type Target = { organizationId: string; portal: string | null; primary: boolean };

// ponytail: per process, a minute stale at most: a domain verified on another instance takes that long to answer there.
let hostCache: { at: number; map: Map<string, Target> } | null = null;
export const forgetHosts = () => void (hostCache = null);

async function verified() {
  if (!hostCache || Date.now() - hostCache.at > 60_000) {
    const rows = await db
      .select({ host: domains.host, organizationId: domains.organizationId, portal: portals.slug, primary: domains.primary })
      .from(domains)
      .leftJoin(portals, eq(portals.id, domains.portalId))
      .where(isNotNull(domains.verifiedAt))
      .orderBy(desc(domains.primary), asc(domains.createdAt));
    hostCache = { at: Date.now(), map: new Map(rows.map((r) => [r.host, { organizationId: r.organizationId, portal: r.portal, primary: r.primary }])) };
  }
  return hostCache.map;
}

/** What a verified host serves: its organization, and the portal when it is a portal's, or the portal a subdomain of PORTAL_DOMAIN names. */
export async function hostTarget(rawHost: string): Promise<Target | null> {
  const host = hostname(rawHost);
  if (!host) return null;
  const t = (await verified()).get(host);
  if (t) return t;
  const slug = slugAtHost(host, env.PORTAL_DOMAIN);
  // Not cached: a portal made or renamed on another instance answers at once.
  const named = slug ? await portalNamed(slug) : null;
  return named && { organizationId: named.organizationId, portal: slug, primary: false };
}

/** The portal a slug names, now or before a rename (portal_aliases), with its organization. */
export async function portalNamed(slug: string) {
  const q = () =>
    db.select({ p: portals, organizationId: workspaces.organizationId }).from(portals).innerJoin(workspaces, eq(workspaces.id, portals.workspaceId));
  const [now] = await q().where(eq(portals.slug, slug));
  if (now) return now;
  const [was] = await q().innerJoin(portalAliases, eq(portalAliases.portalId, portals.id)).where(eq(portalAliases.slug, slug));
  return was ?? null;
}

type PortalRef = { slug: string; access: string; workspaceId: string };

/**
 * Where a portal answers: its own domain once verified; else
 * {slug}.PORTAL_DOMAIN when the server has one; else /p/{slug}, on the
 * organization's domain when it has one. A members portal stays on the app's:
 * sessions don't reach another domain.
 */
export async function portalUrl(p: PortalRef, own: { host: string; verifiedAt: Date | null } | null) {
  const app = new URL(env.APP_URL);
  if (own?.verifiedAt) return `${app.protocol}//${own.host}`;
  if (env.PORTAL_DOMAIN && p.access !== "members" && !subdomainRefusal(p.slug)) {
    return `${app.protocol}//${p.slug}.${env.PORTAL_DOMAIN}${app.port ? `:${app.port}` : ""}`;
  }
  const [ws] = await db.select({ organizationId: workspaces.organizationId }).from(workspaces).where(eq(workspaces.id, p.workspaceId));
  return `${await appUrlFor(ws?.organizationId ?? null)}/p/${p.slug}`;
}

/** The portal a slug names, now or before a rename: its slug now, who it is for, and where it answers. For src/proxy.ts's redirects. */
export async function portalHome(slug: string) {
  const named = await portalNamed(slug);
  if (!named) return null;
  const { p } = named;
  const [own] = await db.select({ host: domains.host, verifiedAt: domains.verifiedAt }).from(domains).where(eq(domains.portalId, p.id));
  return { slug: p.slug, access: p.access, url: await portalUrl(p, own ?? null) };
}

/** The portal a verified host name serves, for the proxy; null for any other host. */
export const portalAtHost = async (host: string) => (await hostTarget(host))?.portal ?? null;

/**
 * Whether a browser origin is one of the app's own: APP_URL, BrandHub's own
 * host (this server's too: following and claiming a brand there), or an
 * organization's verified app domain.
 */
export async function isAppOrigin(origin: string) {
  if (origin === new URL(env.APP_URL).origin || (env.HUB_URL && origin === new URL(env.HUB_URL).origin)) return true;
  try {
    const t = await hostTarget(new URL(origin).host);
    return !!t && !t.portal;
  } catch {
    return false;
  }
}

/**
 * better-auth's trusted origins for a request: the verified app domain it was
 * sent to, if it was sent to one, so sign-in works there. Never every
 * organization's domains: one organization's domain is no reason to trust it
 * on another's, or on APP_URL.
 */
export async function appOriginAt(rawHost: string | null | undefined) {
  const t = rawHost ? await hostTarget(rawHost).catch(() => null) : null;
  return t && !t.portal ? [`${scheme}//${hostname(rawHost!)}`] : [];
}

/** Where an organization's people use the app: its default domain (the first verified one without), else APP_URL. For links in email. */
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

/** How long a claim holds a host name without proof: after that anyone may claim it, so nobody keeps a domain from its owner. */
export const CLAIM_DAYS = 7;

/**
 * The host name `raw` means, if it may be claimed: refuses what isn't one,
 * this server's own, and one in use. A claim unproved for CLAIM_DAYS is not
 * in use: it goes, and this one takes its place.
 */
export async function claimable(raw: string) {
  const host = hostname(raw);
  if (!host) throw new AssetError("invalid", `Not a host name: "${raw}". Say assets.example.com`);
  if (host === appHost) throw new AssetError("invalid", "That is this server's own address");
  if (underDomain(host, env.PORTAL_DOMAIN)) {
    throw new AssetError("invalid", `${env.PORTAL_DOMAIN} is this server's: every portal already answers at {address}.${env.PORTAL_DOMAIN}`);
  }
  const stale = and(eq(domains.host, host), isNull(domains.verifiedAt), lt(domains.createdAt, sql`now() - make_interval(days => ${CLAIM_DAYS})`));
  await db.delete(domains).where(stale);
  const [other] = await db.select().from(domains).where(eq(domains.host, host));
  if (other) throw new AssetError("conflict", `${host} is already in use here`);
  return host;
}

/** A host name of the organization's; it serves nothing until proved. */
export async function claimHost(organizationId: string, raw: string) {
  const host = await claimable(raw);
  const [row] = await db.transaction(async (tx) => {
    await checkLimit(organizationId, "domains", { tx });
    return tx.insert(domains).values({ host, organizationId, token: newToken() }).returning();
  });
  forgetHosts();
  return row;
}

const bare = (h: string) => h.toLowerCase().replace(/\.$/, "");
const addresses = async (host: string) => {
  const [v4, v6] = await Promise.all([resolve4(host).catch(() => []), resolve6(host).catch(() => [])]);
  return [...v4, ...v6];
};

/**
 * Whether `host` reaches DOMAIN_TARGET: a CNAME to it, or, at a zone's apex
 * where a CNAME can't be (flattened, or an ALIAS record), the same addresses.
 * What it points at instead, for the error, when it doesn't.
 */
export async function pointsAt(host: string, target: string): Promise<{ ok: true } | { ok: false; found: string[] }> {
  const cnames = (await resolveCname(host).catch(() => [])).map(bare);
  if (cnames.includes(bare(target))) return { ok: true };
  if (cnames.length) return { ok: false, found: cnames };
  // ponytail: behind a CDN, unrelated hosts share anycast addresses, so this can pass a domain that isn't ours
  // to route. The TXT record still proves who owns it; ask the CDN (e.g. Cloudflare for SaaS status) if routing matters.
  const [mine, theirs] = await Promise.all([addresses(host), addresses(target)]);
  if (mine.length && mine.some((a) => theirs.includes(a))) return { ok: true };
  return { ok: false, found: mine };
}

/**
 * Look for the TXT record now, and that the domain points at the server when
 * it says where (DOMAIN_TARGET). A 422 names what is missing, and what was found.
 */
export async function proveHost(by: Caller, d: typeof domains.$inferSelect, detail: Record<string, unknown> = {}) {
  if (d.verifiedAt) return d;
  const [txt, cname] = await Promise.all([
    resolveTxt(challengeName(d.host)).then(
      (rs) => rs.map((r) => r.join("")),
      () => [] as string[],
    ),
    env.DOMAIN_TARGET ? pointsAt(d.host, env.DOMAIN_TARGET) : ({ ok: true } as const),
  ]);
  const missing = [
    !txt.includes(d.token) && `a TXT record ${challengeName(d.host)} holding ${d.token}`,
    !cname.ok && `a CNAME ${d.host} pointing at ${env.DOMAIN_TARGET}${cname.found.length ? ` (it points at ${cname.found.join(", ")})` : ""}`,
  ].filter(Boolean);
  if (missing.length) {
    throw new AssetError("invalid", `Not found yet: ${missing.join("; ")}. DNS can take a while to reach everyone`, {
      found: { txt, cname: cname.ok ? null : cname.found },
    });
  }
  const [row] = await db.update(domains).set({ verifiedAt: new Date() }).where(eq(domains.host, d.host)).returning();
  await ensurePrimary(row.organizationId);
  forgetHosts();
  await recordAudit(by, "domain.verified", d.host, detail);
  return row;
}

/** With no default, the oldest verified app domain becomes it: links in email always point somewhere on purpose. */
async function ensurePrimary(organizationId: string) {
  const own = eq(domains.organizationId, organizationId);
  const [has] = await db.select({ host: domains.host }).from(domains).where(and(own, eq(domains.primary, true)));
  if (has) return;
  const [next] = await db
    .select({ host: domains.host })
    .from(domains)
    .where(and(own, isNull(domains.portalId), isNotNull(domains.verifiedAt)))
    .orderBy(asc(domains.createdAt))
    .limit(1);
  if (next) await db.update(domains).set({ primary: true }).where(eq(domains.host, next.host));
}

// ---- an organization's own ------------------------------------------------------

/** Where a domain should point, when the server says (DOMAIN_TARGET). */
export const cnameFor = (host: string) => (env.DOMAIN_TARGET ? { type: "CNAME" as const, name: host, value: env.DOMAIN_TARGET } : null);

export const presentDomain = (d: typeof domains.$inferSelect, portal: string | null = null) => ({
  host: d.host,
  verified: !!d.verifiedAt,
  primary: d.primary,
  record: { type: "TXT" as const, name: challengeName(d.host), value: d.token },
  cname: cnameFor(d.host),
  portal,
  url: `${scheme}//${d.host}`,
});

function mayManage(caller: Caller) {
  if (!can(caller, "organization.manage")) throw new AssetError("forbidden", `Domains take ${needs("organization.manage")}`);
}

/** The organization's domains: the app's, and its portals'. */
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

/** An address of the organization's own: the app's until a portal picks it. */
export async function addDomain(caller: Caller, raw: string) {
  mayManage(caller);
  await checkLimit(caller.workspace.organizationId, "domains");
  const d = await claimHost(caller.workspace.organizationId, raw);
  await recordAudit(caller, "domain.added", d.host);
  return presentDomain(d);
}

const own = (organizationId: string, host: string) => and(eq(domains.host, hostname(host) ?? ""), eq(domains.organizationId, organizationId));

async function ownRow(caller: Caller, host: string) {
  const [row] = await db
    .select({ d: domains, portal: portals.slug })
    .from(domains)
    .leftJoin(portals, eq(portals.id, domains.portalId))
    .where(own(caller.workspace.organizationId, host));
  return row ?? null;
}

export async function verifyAppDomain(caller: Caller, host: string) {
  mayManage(caller);
  const r = await ownRow(caller, host);
  return r ? presentDomain(await proveHost(caller, r.d), r.portal) : null;
}

/** Make a verified app domain the default: where links in email point. */
export async function makePrimary(caller: Caller, host: string) {
  mayManage(caller);
  const r = await ownRow(caller, host);
  if (!r) return null;
  if (!r.d.verifiedAt) throw new AssetError("invalid", `Verify ${r.d.host} first`);
  if (r.d.portalId) throw new AssetError("invalid", `${r.d.host} serves the portal /p/${r.portal}: take it off the portal first`);
  if (!r.d.primary) {
    await db.transaction(async (tx) => {
      await tx.update(domains).set({ primary: false }).where(and(eq(domains.organizationId, r.d.organizationId), eq(domains.primary, true)));
      await tx.update(domains).set({ primary: true }).where(eq(domains.host, r.d.host));
    });
    forgetHosts();
    await recordAudit(caller, "domain.primary", r.d.host);
  }
  return presentDomain({ ...r.d, primary: true }, null);
}

/** Stop answering at a domain: the app's, or a portal's, which goes back to /p/{slug}. */
export async function removeDomain(caller: Caller, host: string) {
  mayManage(caller);
  const r = await ownRow(caller, host);
  if (!r) return false;
  await db.delete(domains).where(eq(domains.host, r.d.host));
  await ensurePrimary(r.d.organizationId);
  forgetHosts();
  await recordAudit(caller, "domain.removed", r.d.host);
  return true;
}

/** What a portal may be served at: the organization's verified domains but the default, and the portal each serves. */
export async function portalDomains(caller: Caller) {
  if (!can(caller, "portal.manage")) throw new AssetError("forbidden", `Portals take ${needs("portal.manage")}`);
  const rows = await db
    .select({ host: domains.host, portal: portals.slug })
    .from(domains)
    .leftJoin(portals, eq(portals.id, domains.portalId))
    .where(and(eq(domains.organizationId, caller.workspace.organizationId), isNotNull(domains.verifiedAt), eq(domains.primary, false)))
    .orderBy(asc(domains.host));
  return rows;
}

/**
 * The domain `raw` names, if the portal (null: one not made yet) may take it;
 * null when it has it already. Refuses what isn't the organization's, isn't
 * verified, is the default, or serves another portal.
 */
export async function assignable(organizationId: string, portalId: string | null, raw: string) {
  const [d] = await db.select().from(domains).where(own(organizationId, raw));
  if (!d) throw new AssetError("invalid", `${hostname(raw) ?? raw} isn't one of the organization's domains: add it in Settings, Domains`);
  if (portalId && d.portalId === portalId) return null;
  if (!d.verifiedAt) throw new AssetError("invalid", `Verify ${d.host} in Settings, Domains first`);
  if (d.primary) throw new AssetError("invalid", `${d.host} is the app's default address: make another the default first`);
  if (d.portalId) throw new AssetError("conflict", `${d.host} serves another portal`);
  return d;
}

/**
 * Serve a portal at one of the organization's verified domains, or at none
 * (null): the domain it had goes back to the app. The default can't: it is
 * where the app's links point.
 */
export async function assignHost(organizationId: string, portalId: string, raw: string | null) {
  const d = raw === null ? undefined : await assignable(organizationId, portalId, raw);
  if (d === null) return;
  await db.transaction(async (tx) => {
    await tx.update(domains).set({ portalId: null }).where(eq(domains.portalId, portalId));
    if (d) await tx.update(domains).set({ portalId }).where(eq(domains.host, d.host));
  });
  await ensurePrimary(organizationId);
  forgetHosts();
}
