import { createHash, randomBytes } from "node:crypto";
import { and, asc, count, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, brands, collections, grants, invitations, organizations, users, workspaces } from "@/lib/db/schema";
import { recordAudit, type AuditBy } from "@/lib/core/audit";
import { appUrlFor } from "@/lib/core/domains";
import { joinableAt } from "@/lib/core/email-domains";
import { invitationEmail, sendAs } from "@/lib/core/mail";
import { slugify } from "@/lib/core/brands";
import { AssetError } from "@/lib/core/errors";
import { checkLimit, checkOrganizations } from "@/lib/core/usage";
import { defaultWorkspace, placed, type Caller } from "@/lib/core/access";
import { onlyOrganization } from "@/lib/core/branding";
import { highest, type Ability, type Resource } from "@/lib/access";
import { env } from "@/lib/env";
import { can, needs, type Action } from "@/lib/permissions";
import { seal, unseal } from "@/lib/settings";
import type { Scope } from "@/lib/scopes";

/**
 * People and where they belong: organizations, their workspaces, and grants,
 * which say who may do what on which of them (lib/access.ts). Invitations are
 * grants waiting for someone to sign up or sign in and take them.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Scopes that make someone an editor, which an organization's limits count. */
const EDITS: Scope[] = ["write", "admin"];

// ---- accounts ---------------------------------------------------------------

let someone = false;
/** Whether anyone has an account yet. Once true, it stays true for the process. */
export async function hasUsers() {
  if (someone) return true;
  const [row] = await db.select({ id: users.id }).from(users).limit(1);
  return (someone = !!row);
}

/** The invite page sets this, so signing up can prove it holds an invitation. */
export const INVITE_COOKIE = "ab_invite";
const INVITE_DAYS = 7;
/** Invitations waiting at once per organization: room for a team, not for mailing a list. */
const MAX_PENDING = 200;
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const cookieValue = (header: string | null, name: string) =>
  header?.split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;

async function pending(token: string | null) {
  if (!token) return null;
  const [inv] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.tokenHash, tokenHash(decodeURIComponent(token))), isNull(invitations.acceptedAt), gt(invitations.expiresAt, sql`now()`)));
  return inv ?? null;
}

/** better-auth asks before it makes an account: see lib/auth.ts for the doors. */
export async function maySignUp(cookie: string | null, viaOidc: boolean, email: string) {
  if (env.SIGNUP === "open" || viaOidc || !(await hasUsers())) return true;
  // An organization opened its email domain to whoever proves an address there (lib/core/email-domains.ts).
  return !!(await pending(cookieValue(cookie, INVITE_COOKIE))) || !!(await joinableAt(email));
}

/**
 * After an account is made: the very first one gets admin on every
 * organization, one made from an invitation takes it, and with open sign-up
 * anyone else gets an organization of their own, but for someone an
 * organization's own provider signed in (`joined`), who is its member.
 */
export async function welcome(user: { id: string; name: string; email: string }, cookie: string | null, joined = false) {
  const by: AuditBy = { actor: user.name || user.email, user };
  const [{ n }] = await db.select({ n: count() }).from(users);
  someone = true;
  await recordAudit(by, "user.signed_up", user.email, n === 1 ? { first: true } : undefined, { organizationId: null, workspaceId: null });
  if (n === 1) {
    const orgs = await db.select({ id: organizations.id }).from(organizations);
    if (orgs.length) {
      await db
        .insert(grants)
        .values(orgs.map((o) => ({ userId: user.id, organizationId: o.id, resource: "organization" as const, resourceId: o.id, scope: "admin" as const })))
        .onConflictDoNothing();
    }
  }
  const token = cookieValue(cookie, INVITE_COOKIE);
  if (token && (await pending(token))) await acceptInvitation(decodeURIComponent(token), { ...user, ip: null });
  // At a domain an organization opened, none either: /welcome offers to join it, or to start one of their own.
  else if (n > 1 && env.SIGNUP === "open" && !joined && !(await joinableAt(user.email))) {
    const org = await addOrganization(user.id, `${user.name || user.email.split("@")[0]}'s organization`);
    await recordAudit(by, "organization.created", org.name, { signUp: true }, { organizationId: org.id, workspaceId: null });
  }
}

/** A sign-in, for the audit log, by the person's name rather than their id. */
export async function signedIn(session: { userId: string; ipAddress?: string | null; userAgent?: string | null }) {
  const [u] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, session.userId));
  await recordAudit(
    { actor: u?.name || u?.email || session.userId, user: { id: session.userId }, ip: session.ipAddress ?? null },
    "user.signed_in",
    u?.email ?? null,
    session.userAgent ? { userAgent: session.userAgent } : undefined,
    { organizationId: null, workspaceId: null },
  );
}

// ---- organizations and workspaces -------------------------------------------

const need = (caller: Caller, action: Action) => {
  if (!can(caller, action)) throw new AssetError("forbidden", `You need ${needs(action)}`);
};
/** A workspace of the organization: this one takes admin here, another takes admin on the organization. */
const manageWorkspace = (caller: Caller, id: string) => need(caller, id === caller.workspace.id ? "workspace.manage" : "organization.manage");

/** Organizations and workspaces changed: what is kept of them (lib/memo.ts) is asked again. */
const forgetPlaces = () => {
  defaultWorkspace.forget();
  onlyOrganization.forget();
};

/** A slug free in `taken`: "acme", then "acme-2", "acme-3". */
async function freeSlug(name: string, taken: (slug: string) => Promise<boolean>) {
  const base = slugify(name) || "workspace";
  for (let i = 1; ; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    if (!(await taken(slug))) return slug;
  }
}

/** A workspace, and its default brand so its guidelines page has something to show. */
async function addWorkspace(tx: Tx, organizationId: string, name: string) {
  const slug = await freeSlug(name, async (s) =>
    !!(await tx.select({ id: workspaces.id }).from(workspaces).where(and(eq(workspaces.organizationId, organizationId), eq(workspaces.slug, s))))[0],
  );
  const [ws] = await tx.insert(workspaces).values({ organizationId, slug, name }).returning();
  await tx.insert(brands).values({ workspaceId: ws.id, slug: "default", name, isDefault: true });
  return ws;
}

/** Organizations this caller belongs to: any grant in one is membership. */
export async function listOrganizations(caller: Caller) {
  if (!caller.user) return placed(caller) ? [caller.workspace.organization] : [];
  const rows = await db
    .selectDistinct({ id: organizations.id, slug: organizations.slug, name: organizations.name, createdAt: organizations.createdAt })
    .from(organizations)
    .innerJoin(grants, eq(grants.organizationId, organizations.id))
    .where(eq(grants.userId, caller.user.id))
    .orderBy(asc(organizations.createdAt));
  return rows.map(({ id, slug, name }) => ({ id, slug, name }));
}

/** An organization with one workspace, and its admin. */
function addOrganization(userId: string, name: string) {
  return db.transaction(async (tx) => {
    const slug = await freeSlug(name, async (s) => !!(await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, s)))[0]);
    const [org] = await tx.insert(organizations).values({ slug, name }).returning();
    const ws = await addWorkspace(tx, org.id, "Library");
    await tx.insert(grants).values({ userId, organizationId: org.id, resource: "organization", resourceId: org.id, scope: "admin" });
    return { ...org, ws };
  }).finally(forgetPlaces);
}

/** A new organization with one workspace; whoever makes it is its admin. */
export async function createOrganization(caller: Caller, input: { name: string }) {
  const user = caller.user;
  if (!user) throw new AssetError("forbidden", "Sign in to make an organization");
  await checkOrganizations(user.id);
  const { ws, ...org } = await addOrganization(user.id, input.name);
  await recordAudit(caller, "organization.created", org.name, undefined, { organizationId: org.id, workspaceId: null });
  return { id: org.id, slug: org.slug, name: org.name, workspace: { id: ws.id, slug: ws.slug, name: ws.name } };
}

export async function renameOrganization(caller: Caller, id: string, name: string) {
  if (id !== caller.workspace.organizationId) return null;
  need(caller, "organization.manage");
  const [org] = await db.update(organizations).set({ name }).where(eq(organizations.id, id)).returning();
  if (!org) return null;
  forgetPlaces();
  await recordAudit(caller, "organization.renamed", name, { from: caller.workspace.organization.name }, { workspaceId: null });
  return { id: org.id, slug: org.slug, name: org.name };
}

/**
 * Delete the caller's organization: its workspaces with everything in them,
 * its people's grants, its invitations and settings. Its bytes go with the
 * next sweep (lib/core/sweep.ts), when nothing else holds them. Never the
 * server's last one: a server always has somewhere to land.
 */
export async function deleteOrganization(caller: Caller, id: string) {
  if (id !== caller.workspace.organizationId) return false;
  need(caller, "organization.manage");
  // Deleted, then counted, one at a time: two deletes at once would each see the other's organization still there.
  const gone = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('organizations'))`);
    const gone = await tx.delete(organizations).where(eq(organizations.id, id)).returning({ id: organizations.id });
    const [{ n }] = await tx.select({ n: count() }).from(organizations);
    if (gone.length && n < 1) throw new AssetError("conflict", "This is the server's only organization; make another before deleting it");
    return gone.length > 0;
  });
  if (!gone) return false;
  forgetPlaces();
  await recordAudit(caller, "organization.deleted", caller.workspace.organization.name, undefined, { workspaceId: null });
  return true;
}

/** Workspaces in the caller's organization it can open, and what it may do in each. */
export async function listWorkspaces(caller: Caller) {
  const all = await db
    .select({ id: workspaces.id, slug: workspaces.slug, name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.organizationId, caller.workspace.organizationId))
    .orderBy(asc(workspaces.createdAt));
  if (!caller.user) return placed(caller) ? all.map((w) => ({ ...w, scope: w.id === caller.workspace.id ? caller.scope : caller.orgScope })) : [];
  const mine = await db
    .select({ workspaceId: grants.workspaceId, resource: grants.resource, scope: grants.scope })
    .from(grants)
    .where(and(eq(grants.userId, caller.user.id), eq(grants.organizationId, caller.workspace.organizationId)));
  return all
    .map((w) => ({
      ...w,
      scope: highest(caller.orgScope, ...mine.filter((g) => g.workspaceId === w.id && g.resource === "workspace").map((g) => g.scope)),
      reach: mine.some((g) => g.workspaceId === w.id),
    }))
    .filter((w) => w.scope || w.reach)
    .map(({ id, slug, name, scope }) => ({ id, slug, name, scope }));
}

export async function createWorkspace(caller: Caller, input: { name: string }) {
  need(caller, "organization.manage");
  await checkLimit(caller.workspace.organizationId, "workspaces");
  const ws = await db.transaction(async (tx) => {
    await checkLimit(caller.workspace.organizationId, "workspaces", { tx });
    return addWorkspace(tx, caller.workspace.organizationId, input.name);
  });
  await recordAudit(caller, "workspace.created", ws.name, undefined, { workspaceId: ws.id });
  return { id: ws.id, slug: ws.slug, name: ws.name, scope: caller.orgScope };
}

/**
 * Delete a workspace of the caller's organization, with its assets,
 * collections, brands, keys and links. Its bytes go with the next sweep,
 * when nothing else holds them. Organization admin; never the last one.
 */
export async function deleteWorkspace(caller: Caller, id: string) {
  const [ws] = await db.select().from(workspaces).where(and(eq(workspaces.id, id), eq(workspaces.organizationId, caller.workspace.organizationId)));
  if (!ws) return false;
  need(caller, "organization.manage");
  // Deleted, then counted, one at a time (the organization's row): two deletes at once would each see the other's workspace still there.
  const gone = await db.transaction(async (tx) => {
    await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, ws.organizationId)).for("no key update");
    const gone = await tx.delete(workspaces).where(eq(workspaces.id, id)).returning({ id: workspaces.id });
    const [{ n }] = await tx.select({ n: count() }).from(workspaces).where(eq(workspaces.organizationId, ws.organizationId));
    if (gone.length && n < 1) throw new AssetError("conflict", "An organization keeps at least one workspace: delete the organization instead");
    return gone.length > 0;
  });
  if (!gone) return false;
  forgetPlaces();
  await recordAudit(caller, "workspace.deleted", ws.name, undefined, { workspaceId: id });
  return true;
}

export async function renameWorkspace(caller: Caller, id: string, name: string) {
  const [ws] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, id), eq(workspaces.organizationId, caller.workspace.organizationId)));
  if (!ws) return null;
  manageWorkspace(caller, ws.id);
  const [row] = await db.update(workspaces).set({ name }).where(eq(workspaces.id, id)).returning();
  if (!row) return null;
  forgetPlaces();
  await recordAudit(caller, "workspace.renamed", name, { from: ws.name }, { workspaceId: id });
  return { id: row.id, slug: row.slug, name: row.name };
}

// ---- grants -----------------------------------------------------------------

type Target = { resource: Resource; resourceId: string; organizationId: string; workspaceId: string | null; label: string };

/**
 * What a grant would be on, checked against the caller: the organization
 * needs admin on it, a workspace needs admin there, a collection or an asset
 * needs admin in the caller's workspace, where it must be.
 */
async function target(caller: Caller, resource: Resource, resourceId: string): Promise<Target> {
  const org = caller.workspace.organizationId;
  const nope = () => new AssetError("not_found", `No ${resource} ${resourceId} here`);
  if (resource === "organization") {
    if (resourceId !== org) throw nope();
    need(caller, "organization.manage");
    return { resource, resourceId, organizationId: org, workspaceId: null, label: caller.workspace.organization.name };
  }
  if (resource === "workspace") {
    const [ws] = await db.select().from(workspaces).where(and(eq(workspaces.id, resourceId), eq(workspaces.organizationId, org)));
    if (!ws) throw nope();
    manageWorkspace(caller, ws.id);
    return { resource, resourceId, organizationId: org, workspaceId: ws.id, label: ws.name };
  }
  need(caller, "member.manage");
  const ws = caller.workspace.id;
  const [row] =
    resource === "collection"
      ? await db.select({ label: collections.name }).from(collections).where(and(eq(collections.id, resourceId), eq(collections.workspaceId, ws)))
      : await db
          .select({ label: sql<string>`coalesce(${assets.metadata} ->> 'title', ${assets.filename})` })
          .from(assets)
          .where(and(eq(assets.id, resourceId), eq(assets.workspaceId, ws)));
  if (!row) throw nope();
  return { resource, resourceId, organizationId: org, workspaceId: ws, label: row.label };
}

/** Names for grants and invitations, looked up in one query per kind. */
async function labels(rows: { resource: Resource; resourceId: string }[]) {
  const ids = (r: Resource) => [...new Set(rows.filter((x) => x.resource === r).map((x) => x.resourceId))];
  const [o, w, c, a] = await Promise.all([
    ids("organization").length ? db.select({ id: organizations.id, label: organizations.name }).from(organizations).where(inArray(organizations.id, ids("organization"))) : [],
    ids("workspace").length ? db.select({ id: workspaces.id, label: workspaces.name }).from(workspaces).where(inArray(workspaces.id, ids("workspace"))) : [],
    ids("collection").length ? db.select({ id: collections.id, label: collections.name }).from(collections).where(inArray(collections.id, ids("collection"))) : [],
    ids("asset").length
      ? db
          .select({ id: assets.id, label: sql<string>`coalesce(${assets.metadata} ->> 'title', ${assets.filename})` })
          .from(assets)
          .where(inArray(assets.id, ids("asset")))
      : [],
  ]);
  const map = new Map([...o, ...w, ...c, ...a].map((x) => [x.id, x.label]));
  return (id: string) => map.get(id) ?? null;
}

/**
 * An organization admin sees all of it; a workspace admin, the
 * organization's grants and their workspace's. `here` narrows anyone to the
 * workspace: the grants that open it (the organization's, the workspace's
 * own, and those on its collections and assets).
 */
const visible = (caller: Caller, here = false) =>
  can(caller, "organization.manage") && !here
    ? eq(grants.organizationId, caller.workspace.organizationId)
    : and(eq(grants.organizationId, caller.workspace.organizationId), or(isNull(grants.workspaceId), eq(grants.workspaceId, caller.workspace.id)));

/**
 * People with a grant the caller may see, each with those grants, and
 * invitations waiting. `here`: only who can open this workspace, and
 * invitations into it.
 */
export async function listMembers(caller: Caller, { here = false } = {}) {
  need(caller, "member.manage");
  const rows = await db
    .select({ grant: grants, name: users.name, email: users.email })
    .from(grants)
    .innerJoin(users, eq(users.id, grants.userId))
    .where(visible(caller, here))
    .orderBy(asc(users.name), asc(grants.createdAt));
  const waiting = await db
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.organizationId, caller.workspace.organizationId),
        // Each comes with its live link: one into the whole organization (it can make an admin) is for organization admins only.
        !can(caller, "organization.manage")
          ? eq(invitations.workspaceId, caller.workspace.id)
          : here
            ? or(isNull(invitations.workspaceId), eq(invitations.workspaceId, caller.workspace.id))
            : undefined,
        isNull(invitations.acceptedAt),
        gt(invitations.expiresAt, sql`now()`),
      ),
    )
    .orderBy(asc(invitations.createdAt));
  const label = await labels([...rows.map((r) => r.grant), ...waiting]);
  const people = new Map<string, { id: string; name: string; email: string; grants: ReturnType<typeof presentGrant>[] }>();
  for (const { grant, name, email } of rows) {
    const p = people.get(grant.userId) ?? { id: grant.userId, name, email, grants: [] };
    p.grants.push(presentGrant(grant, label(grant.resourceId)));
    people.set(grant.userId, p);
  }
  const base = await appUrlFor(caller.workspace.organizationId);
  return {
    data: [...people.values()],
    invitations: waiting.map((i) => ({
      id: i.id,
      email: i.email,
      resource: i.resource,
      resourceId: i.resourceId,
      label: label(i.resourceId),
      scope: i.scope,
      limits: i.limits,
      invitedBy: i.invitedBy,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
      url: linkOf(base, i.tokenSealed),
    })),
  };
}

const presentGrant = (g: typeof grants.$inferSelect, label: string | null) => ({
  id: g.id,
  resource: g.resource,
  resourceId: g.resourceId,
  workspaceId: g.workspaceId,
  label,
  scope: g.scope,
  limits: g.limits,
  createdAt: g.createdAt,
});

/** An organization can't be left without an admin: someone has to be able to let people in. */
async function keepsAnAdmin(tx: Tx, organizationId: string, losing: string) {
  const [{ n }] = await tx
    .select({ n: count() })
    .from(grants)
    .where(and(eq(grants.organizationId, organizationId), eq(grants.resource, "organization"), eq(grants.scope, "admin"), ne(grants.id, losing)));
  if (!n) throw new AssetError("conflict", "That would leave the organization without an admin");
}

/**
 * Give a member a scope on something, or change it. Only for people already
 * in the organization: anyone else gets an invitation.
 */
export async function setGrant(caller: Caller, input: { user: string; resource: Resource; resourceId: string; scope: Scope; limits?: Ability[] }) {
  const t = await target(caller, input.resource, input.resourceId);
  const [member] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .innerJoin(grants, eq(grants.userId, users.id))
    .where(and(eq(users.id, input.user), eq(grants.organizationId, t.organizationId)))
    .limit(1);
  if (!member) throw new AssetError("not_found", "No such member; invite them instead");
  if (EDITS.includes(input.scope)) await checkLimit(t.organizationId, "editors", { user: member.id });
  // Left out, a change of scope keeps what was off.
  const limits = input.limits ?? (await limitsOf(member.id, t.resource, t.resourceId));
  const row = await db.transaction(async (tx) => {
    if (EDITS.includes(input.scope)) await checkLimit(t.organizationId, "editors", { user: member.id, tx });
    const [current] = await tx
      .select()
      .from(grants)
      .where(and(eq(grants.userId, member.id), eq(grants.resource, t.resource), eq(grants.resourceId, t.resourceId)));
    if (current?.resource === "organization" && current.scope === "admin" && input.scope !== "admin") await keepsAnAdmin(tx, t.organizationId, current.id);
    const [row] = await tx
      .insert(grants)
      .values({ userId: member.id, organizationId: t.organizationId, workspaceId: t.workspaceId, resource: t.resource, resourceId: t.resourceId, scope: input.scope, limits })
      .onConflictDoUpdate({ target: [grants.userId, grants.resource, grants.resourceId], set: { scope: input.scope, limits } })
      .returning();
    return row;
  });
  await recordAudit(caller, "grant.set", member.email, { resource: t.resource, on: t.label, scope: input.scope, ...(limits.length ? { off: limits } : {}) }, { workspaceId: t.workspaceId });
  return presentGrant(row, t.label);
}

async function limitsOf(userId: string, resource: Resource, resourceId: string): Promise<Ability[]> {
  const [g] = await db
    .select({ limits: grants.limits })
    .from(grants)
    .where(and(eq(grants.userId, userId), eq(grants.resource, resource), eq(grants.resourceId, resourceId)));
  return g?.limits ?? [];
}

export async function removeGrant(caller: Caller, id: string) {
  const [g] = await db.select().from(grants).where(and(eq(grants.id, id), visible(caller)));
  if (!g) return false;
  const t = await target(caller, g.resource, g.resourceId);
  await db.transaction(async (tx) => {
    if (g.resource === "organization" && g.scope === "admin") await keepsAnAdmin(tx, g.organizationId, g.id);
    await tx.delete(grants).where(eq(grants.id, id));
  });
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, g.userId));
  await recordAudit(caller, "grant.removed", u?.email ?? g.userId, { resource: g.resource, on: t.label, scope: g.scope }, { workspaceId: g.workspaceId });
  return true;
}

/**
 * Making something private keeps it in reach of whoever did it: a grant on
 * it at their workspace scope, with what they have off there. An admin
 * reaches it anyway; a key has nobody to give it to.
 */
export async function keepReach(caller: Caller, resource: "collection" | "asset", id: string, tx: Tx | typeof db = db) {
  if (!caller.user || !caller.scope || caller.scope === "admin") return;
  await tx
    .insert(grants)
    .values({
      userId: caller.user.id,
      organizationId: caller.workspace.organizationId,
      workspaceId: caller.workspace.id,
      resource,
      resourceId: id,
      scope: caller.scope,
      limits: caller.off.workspace,
    })
    .onConflictDoNothing();
}

/** A collection's or an asset's grants go with it. */
export async function dropGrants(resource: "collection" | "asset", ids: string[], tx: Tx | typeof db = db) {
  if (!ids.length) return;
  await tx.delete(grants).where(and(eq(grants.resource, resource), inArray(grants.resourceId, ids)));
  await tx.delete(invitations).where(and(eq(invitations.resource, resource), inArray(invitations.resourceId, ids)));
}

// ---- invitations ------------------------------------------------------------

/** On the organization's own domain when it has one: where its people use the app. */
const inviteUrl = async (organizationId: string, token: string) => `${await appUrlFor(organizationId)}/invite/${token}`;
/** A waiting invitation's link, to copy again: null when its sealed token doesn't open (made under another secret). */
const linkOf = (base: string, sealed: string | null) => {
  const token = sealed && unseal(sealed, env.BETTER_AUTH_SECRET);
  return token ? `${base}/invite/${token}` : null;
};

/**
 * An invitation: the link is in this response only, like an API key's
 * secret, and in an email to them when the organization can send one.
 */
export async function createInvitation(caller: Caller, input: { email: string; resource: Resource; resourceId: string; scope: Scope; limits?: Ability[] }) {
  const t = await target(caller, input.resource, input.resourceId);
  if (EDITS.includes(input.scope)) await checkLimit(t.organizationId, "editors");
  const [{ pending }] = await db
    .select({ pending: count() })
    .from(invitations)
    .where(and(eq(invitations.organizationId, t.organizationId), isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date())));
  if (pending >= MAX_PENDING) throw new AssetError("limit_reached", `${MAX_PENDING} invitations are waiting already: revoke some, or wait for them to be accepted`);
  const token = randomBytes(24).toString("base64url");
  const [row] = await db.transaction(async (tx) => {
    if (EDITS.includes(input.scope)) await checkLimit(t.organizationId, "editors", { tx });
    return tx
      .insert(invitations)
      .values({
        organizationId: t.organizationId,
        workspaceId: t.workspaceId,
        email: input.email.toLowerCase(),
        resource: t.resource,
        resourceId: t.resourceId,
        scope: input.scope,
        limits: input.limits ?? [],
        tokenHash: tokenHash(token),
        tokenSealed: seal(token, env.BETTER_AUTH_SECRET),
        invitedBy: caller.actor,
        expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
      })
      .returning();
  });
  await recordAudit(caller, "invitation.created", row.email, { resource: t.resource, on: t.label, scope: row.scope }, { workspaceId: t.workspaceId });
  const url = await inviteUrl(t.organizationId, token);
  const mail = await sendAs(
    t.organizationId,
    invitationEmail(row.email, { invitedBy: caller.actor, organization: caller.workspace.organization.name, label: t.label, scope: row.scope, url }),
  );
  return {
    id: row.id,
    email: row.email,
    resource: row.resource,
    resourceId: row.resourceId,
    label: t.label,
    scope: row.scope,
    limits: row.limits,
    invitedBy: row.invitedBy,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    url,
    emailed: mail.sent,
  };
}

/**
 * Send an invitation again: a new link (the old one stops working, its
 * token was never kept), a new week, and an email when the organization can
 * send one. The link is in this response only.
 */
export async function resendInvitation(caller: Caller, id: string) {
  const [inv] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.id, id), eq(invitations.organizationId, caller.workspace.organizationId), isNull(invitations.acceptedAt)));
  if (!inv) return null;
  const t = await target(caller, inv.resource, inv.resourceId);
  const token = randomBytes(24).toString("base64url");
  const [row] = await db
    .update(invitations)
    .set({ tokenHash: tokenHash(token), tokenSealed: seal(token, env.BETTER_AUTH_SECRET), invitedBy: caller.actor, expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000) })
    .where(eq(invitations.id, id))
    .returning();
  const url = await inviteUrl(t.organizationId, token);
  const mail = await sendAs(
    t.organizationId,
    invitationEmail(row.email, { invitedBy: caller.actor, organization: caller.workspace.organization.name, label: t.label, scope: row.scope, url }),
  );
  await recordAudit(caller, "invitation.resent", row.email, { resource: t.resource, on: t.label, scope: row.scope, emailed: mail.sent }, { workspaceId: t.workspaceId });
  return {
    id: row.id,
    email: row.email,
    resource: row.resource,
    resourceId: row.resourceId,
    label: t.label,
    scope: row.scope,
    limits: row.limits,
    invitedBy: row.invitedBy,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    url,
    emailed: mail.sent,
  };
}

export async function revokeInvitation(caller: Caller, id: string) {
  const [inv] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.id, id), eq(invitations.organizationId, caller.workspace.organizationId), isNull(invitations.acceptedAt)));
  if (!inv) return false;
  await target(caller, inv.resource, inv.resourceId);
  await db.delete(invitations).where(eq(invitations.id, id));
  await recordAudit(caller, "invitation.revoked", inv.email, { resource: inv.resource, scope: inv.scope }, { workspaceId: inv.workspaceId });
  return true;
}

/** What an invitation offers, for the page its link opens. Public: the token is the secret. */
export async function describeInvitation(token: string) {
  const inv = await pending(token);
  if (!inv) return null;
  const label = await labels([inv]);
  const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, inv.organizationId));
  return {
    email: inv.email,
    organization: org.name,
    resource: inv.resource,
    label: label(inv.resourceId),
    scope: inv.scope,
    limits: inv.limits,
    invitedBy: inv.invitedBy,
    expiresAt: inv.expiresAt,
    signUp: !(await db.select({ id: users.id }).from(users).where(eq(users.email, inv.email)))[0],
  };
}

/**
 * Take an invitation: its grant becomes the person's, unless they already
 * have more there. The token is the proof, so whoever holds the link and
 * signs in is who joins, whatever their email.
 */
export async function acceptInvitation(token: string, user: { id: string; name: string; email: string; ip: string | null }) {
  const out = await db.transaction(async (tx) => {
    const [inv] = await tx
      .update(invitations)
      .set({ acceptedAt: sql`now()`, acceptedBy: user.id })
      .where(and(eq(invitations.tokenHash, tokenHash(token)), isNull(invitations.acceptedAt), gt(invitations.expiresAt, sql`now()`)))
      .returning();
    if (!inv) return null;
    const [current] = await tx
      .select()
      .from(grants)
      .where(and(eq(grants.userId, user.id), eq(grants.resource, inv.resource), eq(grants.resourceId, inv.resourceId)));
    // Whichever gives more wins whole: its scope with its limits.
    const keep = current && (highest(current.scope, inv.scope) !== inv.scope || (current.scope === inv.scope && current.limits.length <= inv.limits.length));
    const set = keep ? { scope: current.scope, limits: current.limits } : { scope: inv.scope, limits: inv.limits };
    await tx
      .insert(grants)
      .values({ userId: user.id, organizationId: inv.organizationId, workspaceId: inv.workspaceId, resource: inv.resource, resourceId: inv.resourceId, ...set })
      .onConflictDoUpdate({ target: [grants.userId, grants.resource, grants.resourceId], set });
    return inv;
  });
  if (!out) return null;
  await recordAudit(
    { actor: user.name || user.email, user, ip: user.ip },
    "invitation.accepted",
    user.email,
    { resource: out.resource, scope: out.scope, invited: out.email },
    { organizationId: out.organizationId, workspaceId: out.workspaceId },
  );
  return { organizationId: out.organizationId, workspaceId: out.workspaceId, resource: out.resource, scope: out.scope };
}
