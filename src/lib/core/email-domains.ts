import { randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { and, eq, inArray, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";
import { getDomain } from "tldts";
import { db } from "@/lib/db";
import { emailDomains, grants, joinOffersRefused, organizations, ssoProviders } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { recordAudit } from "@/lib/core/audit";
import { CLAIM_DAYS } from "@/lib/core/domains";
import { AssetError } from "@/lib/core/errors";
import { can, needs } from "@/lib/permissions";
import { freeMail } from "@/lib/free-mail";
import { challengeName, hostname } from "@/lib/portal";
import { lockedBy } from "@/lib/settings";
import { bareDomain, domainsOf } from "@/lib/sso";

/**
 * The domains an organization's people have their email at, each proved by a
 * TXT record on the domain itself. Proving one is all an organization does
 * to say "people at acme.com are ours": single sign-on picks one
 * (lib/core/sso.ts), and joining by domain opens one: anyone whose address
 * is at exactly that domain is offered to join, able to read.
 *
 * Not custom domains (lib/core/domains.ts): those are hosts this server
 * answers at, and a portal at brand.acme.com proves nothing about who reads
 * mail at acme.com. These serve nothing, so no plan limits them.
 */

type Row = typeof emailDomains.$inferSelect;

const present = (r: Row, sso: string | null) => ({
  domain: r.domain,
  verified: !!r.verifiedAt,
  join: r.join,
  /** Single sign-on signs its people in: it can't go while it does. */
  sso: r.domain === sso,
  record: { type: "TXT" as const, name: challengeName(r.domain), value: r.token },
});

function mayManage(caller: Caller) {
  if (!can(caller, "organization.manage")) throw new AssetError("forbidden", `Email domains take ${needs("organization.manage")}`);
}

const ssoDomain = async (organizationId: string) =>
  (await db.select({ domain: ssoProviders.domain }).from(ssoProviders).where(eq(ssoProviders.organizationId, organizationId)))[0]?.domain ?? null;

const own = (caller: Caller, domain: string) => and(eq(emailDomains.organizationId, caller.workspace.organizationId), eq(emailDomains.domain, domain));

export async function listEmailDomains(caller: Caller) {
  mayManage(caller);
  const organizationId = caller.workspace.organizationId;
  const [rows, sso] = await Promise.all([
    db.select().from(emailDomains).where(eq(emailDomains.organizationId, organizationId)).orderBy(emailDomains.createdAt),
    ssoDomain(organizationId),
  ]);
  return rows.map((r) => present(r, sso));
}

/**
 * The organization's claim on a domain, made if it has none: refuses what
 * isn't one, a public suffix (co.uk, github.io: nobody's mailboxes), and one
 * another organization holds. A claim left unproved for CLAIM_DAYS is not
 * held: it goes, with the single sign-on that named it, and this one takes it.
 */
export async function claimEmailDomain(organizationId: string, raw: string) {
  const domain = hostname(raw.replace(/^.*@/, ""));
  if (!domain) throw new AssetError("invalid", `Not a domain: "${raw}". Say the part after the @, e.g. acme.com`);
  if (getDomain(domain, { allowPrivateDomains: true }) === null) throw new AssetError("invalid", `${domain} hands out names to others: say your own domain under it`);
  const [mine] = await db.select().from(emailDomains).where(and(eq(emailDomains.domain, domain), eq(emailDomains.organizationId, organizationId)));
  if (mine) return mine;
  const stale = and(
    eq(emailDomains.domain, domain),
    ne(emailDomains.organizationId, organizationId),
    isNull(emailDomains.verifiedAt),
    lt(emailDomains.createdAt, sql`now() - make_interval(days => ${CLAIM_DAYS})`),
  );
  await db.transaction(async (tx) => {
    const gone = await tx.delete(emailDomains).where(stale).returning();
    if (gone.length) await tx.delete(ssoProviders).where(and(eq(ssoProviders.domain, domain), eq(ssoProviders.domainVerified, false)));
  });
  const [row] = await db
    .insert(emailDomains)
    .values({ domain, organizationId, token: `artbucket-${randomBytes(16).toString("hex")}` })
    .onConflictDoNothing()
    .returning();
  if (!row) throw new AssetError("conflict", `${domain} is another organization's`);
  return row;
}

export async function addEmailDomain(caller: Caller, raw: string) {
  mayManage(caller);
  const organizationId = caller.workspace.organizationId;
  const row = await claimEmailDomain(organizationId, raw);
  await recordAudit(caller, "email_domain.added", row.domain);
  return present(row, await ssoDomain(organizationId));
}

/**
 * Look for the TXT record now; a 422 says what is missing and what was found.
 * Proving it proves it for single sign-on too: better-auth's sso plugin reads
 * the provider's own flag, so it is written here as well.
 */
export async function verifyEmailDomain(caller: Caller, domain: string) {
  mayManage(caller);
  const organizationId = caller.workspace.organizationId;
  const [row] = await db.select().from(emailDomains).where(own(caller, domain));
  if (!row) return null;
  if (row.verifiedAt) return present(row, await ssoDomain(organizationId));
  const name = challengeName(row.domain);
  const txt = await resolveTxt(name).then(
    (rs) => rs.map((r) => r.join("")),
    () => [] as string[],
  );
  if (!txt.includes(row.token)) {
    throw new AssetError("invalid", `Not found yet: a TXT record ${name} holding ${row.token}. DNS can take a while to reach everyone`, { found: { txt } });
  }
  const [done] = await db.transaction(async (tx) => {
    await tx.update(ssoProviders).set({ domainVerified: true }).where(and(eq(ssoProviders.organizationId, organizationId), eq(ssoProviders.domain, row.domain)));
    return tx.update(emailDomains).set({ verifiedAt: sql`now()` }).where(own(caller, domain)).returning();
  });
  await recordAudit(caller, "email_domain.verified", row.domain);
  return present(done, await ssoDomain(organizationId));
}

/** Let a domain go. Not the one single sign-on uses: that one moves, or goes with it. */
export async function removeEmailDomain(caller: Caller, domain: string) {
  mayManage(caller);
  if ((await ssoDomain(caller.workspace.organizationId)) === domain) {
    throw new AssetError("conflict", `Single sign-on uses ${domain}: give it another domain, or turn it off, first`);
  }
  const [row] = await db.delete(emailDomains).where(own(caller, domain)).returning();
  if (!row) return false;
  await recordAudit(caller, "email_domain.removed", domain);
  return true;
}

/** Joining by domain needs an address proved before anything joins: the server's own email sends that code (lib/auth.ts). */
const proves = () => lockedBy("email", process.env);

/** A proved provider at the domain or above it: its people sign up through it (lib/auth.ts). */
const ssoOver = async (domain: string) =>
  !!(
    await db
      .select({ id: ssoProviders.id })
      .from(ssoProviders)
      .where(and(inArray(ssoProviders.domain, domainsOf(`@${domain}`)), eq(ssoProviders.domainVerified, true)))
  )[0];

/**
 * Open a proved domain to joining, or close it. Not free mail (orange.fr's
 * customers would walk into Orange's organization), and not a domain single
 * sign-on covers: its people join through the provider already.
 */
export async function setJoin(caller: Caller, domain: string, join: boolean) {
  mayManage(caller);
  const [row] = await db.select().from(emailDomains).where(own(caller, domain));
  if (!row) return null;
  if (join) {
    if (!row.verifiedAt) throw new AssetError("invalid", `Prove ${domain} first`);
    if (freeMail(domain)) throw new AssetError("invalid", `${domain} gives addresses to the public: anyone could join`);
    if (await ssoOver(domain)) throw new AssetError("invalid", `Single sign-on covers ${domain}: its people join through your provider`);
    if (!proves()) throw new AssetError("invalid", "This server sends no email of its own, so it can't confirm an address before it joins");
  }
  const [done] = await db.update(emailDomains).set({ join }).where(own(caller, domain)).returning();
  await recordAudit(caller, join ? "email_domain.opened" : "email_domain.closed", domain);
  return present(done, await ssoDomain(caller.workspace.organizationId));
}

/**
 * The organization an address may join by its domain: one that proved
 * exactly that domain and opened it. jo@eu.acme.com is not acme.com's here,
 * as it would be for single sign-on, where the provider vouches anyway.
 */
export async function joinableAt(email: string) {
  if (!proves() || !email.includes("@")) return null;
  const domain = bareDomain(email.split("@").at(-1) ?? "");
  if (freeMail(domain)) return null;
  const [row] = await db
    .select({ id: organizations.id, name: organizations.name, domain: emailDomains.domain })
    .from(emailDomains)
    .innerJoin(organizations, eq(organizations.id, emailDomains.organizationId))
    .where(and(eq(emailDomains.domain, domain), eq(emailDomains.join, true), isNotNull(emailDomains.verifiedAt)));
  return row && !(await ssoOver(domain)) ? row : null;
}

/** What the signed-in person is offered: an organization at their address's domain they aren't in, and didn't say not now to. */
export async function joinOffer(caller: Caller) {
  const user = caller.user;
  if (!user || caller.key) return null;
  const at = await joinableAt(user.email);
  if (!at) return null;
  const [inside, refused] = await Promise.all([
    db.select({ id: grants.id }).from(grants).where(and(eq(grants.userId, user.id), eq(grants.organizationId, at.id))).limit(1),
    db.select().from(joinOffersRefused).where(and(eq(joinOffersRefused.userId, user.id), eq(joinOffersRefused.organizationId, at.id))),
  ]);
  return inside.length || refused.length ? null : { organization: { id: at.id, name: at.name }, domain: at.domain };
}

/** Take the offer: a member of the organization from now on, able to read. */
export async function acceptJoin(caller: Caller) {
  const offer = await joinOffer(caller);
  if (!offer) return null;
  const user = caller.user!;
  const organizationId = offer.organization.id;
  await db.insert(grants).values({ userId: user.id, organizationId, resource: "organization", resourceId: organizationId, scope: "read" }).onConflictDoNothing();
  await recordAudit({ actor: user.name || user.email, user }, "email_domain.joined", user.email, { domain: offer.domain, scope: "read" }, { organizationId, workspaceId: null });
  return offer;
}

/** Not now: the offer goes, for good. */
export async function refuseJoin(caller: Caller) {
  const offer = await joinOffer(caller);
  if (!offer) return null;
  await db.insert(joinOffersRefused).values({ userId: caller.user!.id, organizationId: offer.organization.id }).onConflictDoNothing();
  return offer;
}
