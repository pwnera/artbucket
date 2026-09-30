import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, brandVersions, domains, githubOrgs, hubReports, organizations, workspaces } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { recordAudit } from "@/lib/core/audit";
import { CLAIM_DAYS } from "@/lib/core/domains";
import { AssetError } from "@/lib/core/errors";
import { FetchError, fetchPublic } from "@/lib/fetch-public";
import { GITHUB_PROOF_FILE, githubLogin, githubProof, githubProofUrl, type ReportReason } from "@/lib/hub";
import { can, needs } from "@/lib/permissions";
import { limiter } from "@/lib/rate";

/**
 * Trust on BrandHub (PRD, hub v2): who a listing's organization proved it
 * is, and what anyone may say about a listing. An organization proves a
 * domain (lib/core/domains.ts) or a GitHub account (here); either makes its
 * listings verified. Anyone may report a public listing; an organization
 * that proved something may claim one, as the brand's owner. Both land with
 * the listing's organization's admins (Settings, BrandHub), who can take it
 * off the hub, and in the database for whoever runs the server, who can
 * delist it for good (brands.hub_delisted).
 */

const mayManage = (caller: Caller) => {
  if (!can(caller, "organization.manage")) throw new AssetError("forbidden", `BrandHub settings take ${needs("organization.manage")}`);
};

// ---- what an organization proved --------------------------------------------------

/**
 * What each organization proved it holds, the first to name it: its default
 * verified domain, else any verified domain, else a GitHub account
 * (github.com/{login}). A listing's badge names it.
 */
export async function proofsOf(orgIds: string[]) {
  const ids = [...new Set(orgIds)];
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const [hosts, logins] = await Promise.all([
    db
      .select({ orgId: domains.organizationId, host: domains.host })
      .from(domains)
      .where(and(inArray(domains.organizationId, ids), isNotNull(domains.verifiedAt)))
      .orderBy(desc(domains.primary), asc(domains.createdAt)),
    db
      .select({ orgId: githubOrgs.organizationId, login: githubOrgs.login })
      .from(githubOrgs)
      .where(and(inArray(githubOrgs.organizationId, ids), isNotNull(githubOrgs.verifiedAt)))
      .orderBy(asc(githubOrgs.createdAt)),
  ]);
  for (const r of [...hosts.map((h) => ({ orgId: h.orgId, proof: h.host })), ...logins.map((l) => ({ orgId: l.orgId, proof: githubProof(l.login) }))]) {
    if (!out.has(r.orgId)) out.set(r.orgId, r.proof);
  }
  return out;
}

const presentGithub = (g: typeof githubOrgs.$inferSelect) => ({
  login: g.login,
  verified: !!g.verifiedAt,
  url: `https://github.com/${g.login}`,
  /** Where the proof goes: this file, holding `token`, in the account's `.github` repository. */
  file: { repository: `${g.login}/.github`, path: GITHUB_PROOF_FILE, url: `https://github.com/${g.login}/.github`, token: g.token },
});

/** The GitHub accounts the organization named, proved or not. */
export async function listGithub(caller: Caller) {
  mayManage(caller);
  const rows = await db.select().from(githubOrgs).where(eq(githubOrgs.organizationId, caller.workspace.organizationId)).orderBy(asc(githubOrgs.createdAt));
  return rows.map(presentGithub);
}

/**
 * Name a GitHub account as the organization's; it proves nothing until
 * verified. As with domains, a claim unproved for CLAIM_DAYS goes, so nobody
 * keeps an account from its owner.
 */
export async function addGithub(caller: Caller, raw: string) {
  mayManage(caller);
  const login = githubLogin(raw);
  if (!login) throw new AssetError("invalid", `Not a GitHub account: "${raw}". Say rust-lang, or https://github.com/rust-lang`);
  await db.delete(githubOrgs).where(and(eq(githubOrgs.login, login), isNull(githubOrgs.verifiedAt), lt(githubOrgs.createdAt, sql`now() - make_interval(days => ${CLAIM_DAYS})`)));
  const [row] = await db
    .insert(githubOrgs)
    .values({ login, organizationId: caller.workspace.organizationId, token: `artbucket-${randomBytes(16).toString("hex")}` })
    .onConflictDoNothing()
    .returning();
  if (!row) throw new AssetError("conflict", `github.com/${login} is already named here`);
  await recordAudit(caller, "github.added", login);
  return presentGithub(row);
}

const ownGithub = async (caller: Caller, raw: string) => {
  const [row] = await db
    .select()
    .from(githubOrgs)
    .where(and(eq(githubOrgs.login, githubLogin(raw) ?? ""), eq(githubOrgs.organizationId, caller.workspace.organizationId)));
  return row ?? null;
};

/**
 * Look for the proof now: the file in the account's `.github` repository,
 * read from raw.githubusercontent.com (fetchPublic: small, quick, and no
 * redirect, so a renamed repository elsewhere proves nothing). A 422 says
 * what was missing.
 */
export async function verifyGithub(caller: Caller, raw: string) {
  mayManage(caller);
  const g = await ownGithub(caller, raw);
  if (!g) return null;
  if (g.verifiedAt) return presentGithub(g);
  const where = `${GITHUB_PROOF_FILE} in github.com/${g.login}/.github, holding ${g.token}`;
  const text = await fetchPublic(githubProofUrl(g.login), { maxBytes: 4096, timeoutMs: 10_000, redirects: 0 }).then(
    (r) => r.bytes.toString("utf8"),
    (err) => {
      if (err instanceof FetchError || (err as NodeJS.ErrnoException).code) return null;
      throw err;
    },
  );
  if (!text?.includes(g.token)) throw new AssetError("invalid", `Not found yet: ${where}. It must be on the repository's default branch`);
  const [row] = await db.update(githubOrgs).set({ verifiedAt: new Date() }).where(eq(githubOrgs.login, g.login)).returning();
  await recordAudit(caller, "github.verified", g.login);
  return presentGithub(row);
}

export async function removeGithub(caller: Caller, raw: string) {
  mayManage(caller);
  const g = await ownGithub(caller, raw);
  if (!g) return false;
  await db.delete(githubOrgs).where(eq(githubOrgs.login, g.login));
  await recordAudit(caller, "github.removed", g.login);
  return true;
}

// ---- reports and claims ---------------------------------------------------------------

/** A public listing at {org}/{brand}: public, published, and not delisted. */
async function publicListing(org: string, slug: string) {
  const [b] = await db
    .select({ id: brands.id, name: brands.name, orgId: organizations.id })
    .from(brands)
    .innerJoin(workspaces, eq(workspaces.id, brands.workspaceId))
    .innerJoin(organizations, eq(organizations.id, workspaces.organizationId))
    .where(
      and(
        eq(organizations.slug, org),
        eq(brands.slug, slug),
        eq(brands.visibility, "public"),
        isNull(brands.hubDelisted),
        sql`exists (select 1 from ${brandVersions} v where v.brand_id = ${brands.id} and v.published_at is not null)`,
      ),
    );
  if (!b) throw new AssetError("not_found", `Nothing is listed at ${org}/${slug}`);
  return b;
}

/**
 * Reports per address and listing, per listing, and in all, as a portal's
 * asks are counted (lib/core/portals.ts): enough for people, not for a flood.
 * The address is only a key in memory, never stored.
 */
const perAddress = limiter(5, 60 * 60_000);
const perListing = limiter(30, 60 * 60_000);
const overall = limiter(300, 60 * 60_000);
/** Past this many open ones, a listing's reports are counted but not kept: its admins have plenty to read. */
const OPEN_MAX = 200;

/**
 * Anyone, signed in or not, tells a listing's organization and the server's
 * operator what is wrong with it. It answers the same whether it was kept,
 * so the answer says nothing about who else reported it.
 */
export async function reportListing(org: string, slug: string, input: { reason: ReportReason; note?: string; contact?: string }, ip: string | null) {
  const b = await publicListing(org, slug);
  const wait = perAddress.hit(`${ip ?? "?"}:${b.id}`) || perListing.hit(b.id) || overall.hit("all");
  if (wait) throw new AssetError("rate_limited", `Too many reports. Try again in ${Math.ceil(wait / 60)} min`);
  const [{ open }] = await db
    .select({ open: sql<number>`count(*)::int` })
    .from(hubReports)
    .where(and(eq(hubReports.brandId, b.id), eq(hubReports.status, "open")));
  if (open < OPEN_MAX) {
    await db.insert(hubReports).values({ brandId: b.id, kind: "report", reason: input.reason, note: input.note || null, contact: input.contact || null });
  }
  return { received: true as const };
}

const claims = limiter(10, 60 * 60_000);

/**
 * An organization that proved a domain or a GitHub account says a listing is
 * its brand. The listing's admins see who claims it, what they proved and
 * how to reach them (the claimant's email, which they agree to share by
 * claiming), and hand it over or take it off the hub; the operator sees it
 * too. One open claim per organization and listing.
 */
export async function claimListing(caller: Caller, org: string, slug: string, input: { note?: string }) {
  mayManage(caller);
  if (!caller.user) throw new AssetError("forbidden", "A person claims a listing, signed in: not a key");
  const b = await publicListing(org, slug);
  const mine = caller.workspace.organizationId;
  if (b.orgId === mine) throw new AssetError("invalid", "This listing is your organization's already");
  const proof = (await proofsOf([mine])).get(mine);
  if (!proof) throw new AssetError("invalid", "Prove a domain (Settings, Domains) or a GitHub account (Settings, BrandHub) first: a claim names what you hold");
  const wait = claims.hit(mine);
  if (wait) throw new AssetError("rate_limited", `Too many claims. Try again in ${Math.ceil(wait / 60)} min`);
  const [had] = await db
    .select({ id: hubReports.id })
    .from(hubReports)
    .where(and(eq(hubReports.brandId, b.id), eq(hubReports.kind, "claim"), eq(hubReports.claimantId, mine), eq(hubReports.status, "open")));
  if (!had) {
    await db.insert(hubReports).values({ brandId: b.id, kind: "claim", reason: "claim", note: input.note || null, contact: caller.user.email, claimantId: mine, proof });
  }
  return { received: true as const, proof };
}

/** Reports and claims about the organization's listings, open first, newest first: Settings, BrandHub. */
export async function listReports(caller: Caller) {
  mayManage(caller);
  const claimant = sql<string | null>`(select o.name from ${organizations} o where o.id = ${hubReports.claimantId})`;
  const rows = await db
    .select({ r: hubReports, brand: brands.slug, name: brands.name, visibility: brands.visibility, workspace: workspaces.slug, claimant })
    .from(hubReports)
    .innerJoin(brands, eq(brands.id, hubReports.brandId))
    .innerJoin(workspaces, eq(workspaces.id, brands.workspaceId))
    .where(eq(workspaces.organizationId, caller.workspace.organizationId))
    .orderBy(sql`${hubReports.status} = 'open' desc`, desc(hubReports.createdAt))
    .limit(200);
  return rows.map(({ r, ...b }) => ({
    id: r.id,
    kind: r.kind,
    reason: r.reason,
    note: r.note,
    contact: r.contact,
    claimant: r.claimantId ? { name: b.claimant ?? "A deleted organization", proof: r.proof } : null,
    status: r.status,
    createdAt: r.createdAt,
    brand: { slug: b.brand, name: b.name, workspace: b.workspace, visibility: b.visibility },
  }));
}

/**
 * Mark a report or a claim dealt with, or open again; with `delist`, take its
 * listing off the hub (the brand goes private, as on the Brands page).
 */
export async function decideReport(caller: Caller, id: string, patch: { status?: "open" | "resolved"; delist?: true }) {
  mayManage(caller);
  const [row] = await db
    .select({ r: hubReports, brand: brands })
    .from(hubReports)
    .innerJoin(brands, eq(brands.id, hubReports.brandId))
    .innerJoin(workspaces, eq(workspaces.id, brands.workspaceId))
    .where(and(eq(hubReports.id, id), eq(workspaces.organizationId, caller.workspace.organizationId)));
  if (!row) return null;
  const delist = patch.delist && row.brand.visibility === "public";
  if (delist) {
    await db.update(brands).set({ visibility: "private" }).where(eq(brands.id, row.brand.id));
    await recordAudit(caller, "brand.private", row.brand.name, { brand: row.brand.slug, report: id });
  }
  const status = patch.status ?? row.r.status;
  if (status !== row.r.status) await db.update(hubReports).set({ status }).where(eq(hubReports.id, id));
  return { id, status, brand: { slug: row.brand.slug, visibility: delist ? ("private" as const) : row.brand.visibility } };
}
