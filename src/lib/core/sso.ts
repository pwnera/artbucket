import { randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { and, eq, ilike, inArray, lt, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { grants, sessions, ssoProviders, users } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { recordAudit } from "@/lib/core/audit";
import { CLAIM_DAYS } from "@/lib/core/domains";
import { AssetError } from "@/lib/core/errors";
import { checkLimit } from "@/lib/core/usage";
import { env } from "@/lib/env";
import { fetchPublic } from "@/lib/fetch-public";
import { memo } from "@/lib/memo";
import { can, needs } from "@/lib/permissions";
import { challengeName, hostname } from "@/lib/portal";
import { atDomain, discoveryUrl, domainsOf, oidcConfigFrom, type OidcConfig } from "@/lib/sso";

/**
 * An organization's own single sign-on: one OpenID Connect provider (Okta,
 * Entra ID, Google Workspace, Keycloak...) for the people at one email
 * domain. An admin registers this server with the provider, saves the
 * client here, and proves the domain with a TXT record. From then on anyone
 * at that domain signs in through the provider (lib/auth.ts, better-auth's
 * sso plugin), and the first time joins the organization, able to read.
 *
 * Free, like the server-wide OIDC_* one: single sign-on is no paid tier.
 */

type Row = typeof ssoProviders.$inferSelect;

/** Where the provider sends people back: registered with it as the app's redirect URI. */
export const redirectUri = (organizationId: string) => `${env.APP_URL}/api/auth/sso/callback/${organizationId}`;

const config = (r: Row) => JSON.parse(r.oidcConfig) as OidcConfig;

/** What an admin sees of it: never the secret. */
export const presentSso = (r: Row) => ({
  issuer: r.issuer,
  clientId: config(r).clientId,
  domain: r.domain,
  verified: r.domainVerified,
  required: r.required,
  record: { type: "TXT" as const, name: challengeName(r.domain), value: r.token ?? "" },
  redirectUri: redirectUri(r.organizationId),
});

/** Whether any organization here signs in through its own provider: the sign-in page offers it then. */
export const ssoOffered = memo(60_000, async () => {
  const [row] = await db.select({ id: ssoProviders.id }).from(ssoProviders).where(eq(ssoProviders.domainVerified, true)).limit(1);
  return !!row;
});

function mayManage(caller: Caller) {
  if (!can(caller, "organization.manage")) throw new AssetError("forbidden", `Single sign-on takes ${needs("organization.manage")}`);
}

const own = (caller: Caller) => eq(ssoProviders.organizationId, caller.workspace.organizationId);

export async function getSso(caller: Caller) {
  mayManage(caller);
  const [row] = await db.select().from(ssoProviders).where(own(caller));
  return row ? presentSso(row) : null;
}

/** The provider's endpoints, from its discovery document: fetched only from a public address. */
async function discover(issuer: string, client: { clientId: string; clientSecret: string }) {
  try {
    const { bytes } = await fetchPublic(discoveryUrl(issuer), { maxBytes: 256 * 1024, timeoutMs: 10_000 });
    return oidcConfigFrom(JSON.parse(bytes.toString("utf8")), issuer, client);
  } catch (e) {
    throw new AssetError("invalid", `Couldn't read ${discoveryUrl(issuer)}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export type SsoInput = { issuer: string; clientId: string; clientSecret?: string; domain: string };

/**
 * Set up, or change, the organization's provider. A new domain waits for its
 * TXT record again; a domain claimed by another organization is refused,
 * unless that claim went CLAIM_DAYS unproved.
 */
export async function saveSso(caller: Caller, input: SsoInput) {
  mayManage(caller);
  const organizationId = caller.workspace.organizationId;
  const domain = hostname(input.domain);
  if (!domain) throw new AssetError("invalid", `Not a domain: "${input.domain}". Say the part after the @, e.g. acme.com`);
  const issuer = input.issuer.trim().replace(/\/$/, "");
  const [had] = await db.select().from(ssoProviders).where(own(caller));
  // A new provider needs the feature (LIMIT_FEATURES, docs: configuration/limits); one already set up can still change.
  if (!had) await checkLimit(organizationId, "sso");
  const clientSecret = input.clientSecret || (had && config(had).clientSecret);
  if (!clientSecret) throw new AssetError("invalid", "The client secret is needed to set it up");
  const oidc = await discover(issuer, { clientId: input.clientId.trim(), clientSecret });

  const others = and(eq(ssoProviders.domain, domain), ne(ssoProviders.organizationId, organizationId));
  await db.delete(ssoProviders).where(and(others, eq(ssoProviders.domainVerified, false), lt(ssoProviders.createdAt, sql`now() - make_interval(days => ${CLAIM_DAYS})`)));
  const [taken] = await db.select({ id: ssoProviders.id }).from(ssoProviders).where(others);
  if (taken) throw new AssetError("conflict", `${domain} signs in through another organization's provider`);

  const moved = !had || had.domain !== domain;
  const values = {
    issuer: oidc.issuer,
    oidcConfig: JSON.stringify(oidc),
    domain,
    userId: caller.user?.id ?? null,
    // A new domain is proved again, and nobody there is held to the provider until it is.
    ...(moved ? { domainVerified: false, required: false, token: `artbucket-${randomBytes(16).toString("hex")}` } : {}),
  };
  const [row] = had
    ? await db.update(ssoProviders).set(values).where(eq(ssoProviders.id, had.id)).returning()
    : await db
        .insert(ssoProviders)
        .values({ id: organizationId, providerId: organizationId, organizationId, ...values })
        .returning();
  ssoOffered.forget();
  await recordAudit(caller, "sso.saved", domain, { issuer });
  return presentSso(row);
}

/** Look for the TXT record now; a 422 says what is missing and what was found. */
export async function verifySso(caller: Caller) {
  mayManage(caller);
  const [row] = await db.select().from(ssoProviders).where(own(caller));
  if (!row) return null;
  if (row.domainVerified) return presentSso(row);
  const name = challengeName(row.domain);
  const txt = await resolveTxt(name).then(
    (rs) => rs.map((r) => r.join("")),
    () => [] as string[],
  );
  if (!row.token || !txt.includes(row.token)) {
    throw new AssetError("invalid", `Not found yet: a TXT record ${name} holding ${row.token}. DNS can take a while to reach everyone`, { found: { txt } });
  }
  const [done] = await db.update(ssoProviders).set({ domainVerified: true }).where(eq(ssoProviders.id, row.id)).returning();
  ssoOffered.forget();
  await recordAudit(caller, "sso.verified", row.domain);
  return presentSso(done);
}

/** The organization's admins: user ids of whoever holds admin on it. */
const adminsOf = async (organizationId: string) =>
  (
    await db
      .select({ id: grants.userId })
      .from(grants)
      .where(and(eq(grants.resource, "organization"), eq(grants.resourceId, organizationId), eq(grants.scope, "admin")))
  ).map((g) => g.id);

/**
 * Hold everyone at the domain to the provider, or let passwords back. Its
 * admins are never held: a provider that breaks later (a rotated secret, a
 * changed app) can't lock the organization out of fixing it. Holding them
 * signs out everyone else at the domain, so they come back through it.
 */
export async function setSsoRequired(caller: Caller, required: boolean) {
  mayManage(caller);
  const [row] = await db.select().from(ssoProviders).where(own(caller));
  if (!row) return null;
  if (required && !row.domainVerified) throw new AssetError("invalid", `Prove ${row.domain} first: until then nobody signs in through the provider`);
  const [done] = await db.update(ssoProviders).set({ required }).where(eq(ssoProviders.id, row.id)).returning();
  if (required && !row.required) {
    const admins = await adminsOf(row.organizationId);
    // ilike finds the candidates, atDomain decides: a domain's dots and underscores aren't LIKE's to read.
    const there = (await db.select({ id: users.id, email: users.email }).from(users).where(ilike(users.email, `%${row.domain}`)))
      .filter((u) => atDomain(u.email, row.domain) && !admins.includes(u.id))
      .map((u) => u.id);
    if (there.length) await db.delete(sessions).where(inArray(sessions.userId, there));
  }
  await recordAudit(caller, required ? "sso.required" : "sso.optional", row.domain);
  return presentSso(done);
}

/**
 * Whether a password may not sign this address in, nor reset: its domain's
 * provider is required, and it isn't one of that organization's admins.
 */
export async function passwordBarred(email: string) {
  const row = await ssoAt(email);
  if (!row?.required) return false;
  const [me] = await db.select({ id: users.id }).from(users).where(eq(users.email, email.trim().toLowerCase()));
  return !me || !(await adminsOf(row.organizationId)).includes(me.id);
}

/** Stop signing in through it. People who joined keep their access and their accounts; they sign in with a password reset. */
export async function removeSso(caller: Caller) {
  mayManage(caller);
  const [row] = await db.delete(ssoProviders).where(own(caller)).returning();
  if (!row) return false;
  ssoOffered.forget();
  await recordAudit(caller, "sso.removed", row.domain);
  return true;
}

// ---- signing in -----------------------------------------------------------------

/**
 * The verified provider an account may be made or signed in through, if the
 * address is at its domain. A provider vouches for its own domain only: an
 * account for someone else's address would squat it.
 */
export async function providerFor(providerId: string, email: string) {
  const [row] = await db
    .select()
    .from(ssoProviders)
    .where(and(eq(ssoProviders.providerId, providerId), eq(ssoProviders.domainVerified, true)));
  return row && atDomain(email, row.domain) ? row : null;
}

/**
 * The verified provider of the domain an address is at, if some organization
 * has one: a password sign-up there goes through it instead (lib/auth.ts), so
 * its people join it rather than an organization of their own.
 */
export async function ssoAt(email: string) {
  const domains = domainsOf(email);
  if (!domains.length) return null;
  const rows = await db
    .select()
    .from(ssoProviders)
    .where(and(inArray(ssoProviders.domain, domains), eq(ssoProviders.domainVerified, true)));
  // The nearest: eu.acme.com's own provider over acme.com's.
  return rows.sort((a, b) => b.domain.length - a.domain.length)[0] ?? null;
}

/** Someone the organization's provider signed in: a member from now on, able to read, unless they already had a grant there. */
export async function joinThroughSso(user: { id: string; name: string; email: string }, providerId: string) {
  const row = await providerFor(providerId, user.email);
  if (!row) return;
  const organizationId = row.organizationId;
  const added = await db
    .insert(grants)
    .values({ userId: user.id, organizationId, resource: "organization", resourceId: organizationId, scope: "read" })
    .onConflictDoNothing()
    .returning({ id: grants.id });
  if (added.length) {
    await recordAudit({ actor: user.name || user.email, user }, "sso.joined", user.email, { scope: "read" }, { organizationId, workspaceId: null });
  }
}
