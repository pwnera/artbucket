import { and, asc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import pkg from "../../../package.json" with { type: "json" };
import { db } from "@/lib/db";
import { apiKeys, collections, grants, organizations, workspaces } from "@/lib/db/schema";
import { auth, google, oidc } from "@/lib/auth";
import { joinOffer } from "@/lib/core/email-domains";
import { hashKey } from "@/lib/core/keys";
import { canEmail, canResetPasswords } from "@/lib/core/mail";
import { hasUsers } from "@/lib/core/people";
import { ssoOffered } from "@/lib/core/sso";
import { effective } from "@/lib/core/settings";
import { limitsOf } from "@/lib/core/usage";
import { accessIn, capAt, highest, isNarrowed, NO_OFF, NONE, type Access } from "@/lib/access";
import { env } from "@/lib/env";
import { hubHome } from "@/lib/hub";
import { memo } from "@/lib/memo";
import { upgradeUrl } from "@/lib/limits";
import { lockedBy, noticeOf } from "@/lib/settings";
import type { Scope } from "@/lib/scopes";

/**
 * Who is calling, where, and what they may do there. Every request resolves
 * to one of three callers:
 *
 * - an API key: one workspace, one scope, named for history. One a person
 *   connected (OAuth, `artbucket login`) is also held to what they can do,
 *   and may be in several workspaces, a row each: the one asked for, else
 *   the oldest
 * - a signed-in person: the workspace in the `ab_workspace` cookie if they
 *   can open it, else their first; their scope is what their grants add up
 *   to there (lib/access.ts)
 * - nobody: ANONYMOUS_SCOPE, which unset is nothing
 *
 * Until the first account exists nothing works at all (lib/api.ts): the
 * app asks for that account first, and it becomes the admin.
 */

export type Workspace = {
  id: string;
  slug: string;
  name: string;
  organizationId: string;
  organization: { id: string; slug: string; name: string };
};
export type Person = { id: string; name: string; email: string };

export type Caller = Access & {
  workspace: Workspace;
  /** On the workspace's organization: admin there manages its people and workspaces. */
  orgScope: Scope | null;
  /** How history and the audit log name them: a person's name, a key's name, or "web". */
  actor: string;
  user: Person | null;
  /** The API key's id. */
  key: string | null;
  ip: string | null;
  /** The organization is read-only (lib/limits.ts): whatever the grants say, the scope here is read at most. */
  readOnly?: boolean;
};

/** The web app's workspace switcher sets this; it holds a workspace id. */
export const WORKSPACE_COOKIE = "ab_workspace";

/** Nothing before the first account exists, whatever ANONYMOUS_SCOPE says: setup comes first. */
export async function anonymousScope(): Promise<Scope | null> {
  return (await hasUsers()) ? (env.ANONYMOUS_SCOPE ?? null) : null;
}

const ws = {
  id: workspaces.id,
  slug: workspaces.slug,
  name: workspaces.name,
  organizationId: workspaces.organizationId,
  organization: { id: organizations.id, slug: organizations.slug, name: organizations.name },
};

function workspacesWhere(where?: SQL): Promise<Workspace[]> {
  return db
    .select(ws)
    .from(workspaces)
    .innerJoin(organizations, eq(organizations.id, workspaces.organizationId))
    .where(where)
    .orderBy(asc(organizations.createdAt), asc(workspaces.createdAt));
}

/**
 * The oldest workspace: where a caller with nowhere else to be lands. There
 * is always one. Kept a minute (lib/memo.ts); deleting a workspace forgets it.
 */
export const defaultWorkspace = memo(60_000, async () => {
  const [first] = await workspacesWhere();
  if (!first) throw new Error("No workspace: run `pnpm db:migrate`");
  return first;
});

const NIL = "00000000-0000-0000-0000-000000000000";

/**
 * Where /me says a caller who can open no workspace is: nowhere. Never the
 * workspace they fell back to (the oldest), whose name and organization are
 * someone else's.
 */
const NOWHERE: Workspace = { id: NIL, slug: "", name: "", organizationId: NIL, organization: { id: NIL, slug: "", name: "" } };

/** The caller can open their workspace: a key, a scope there or on its organization, or grants inside it. */
export const placed = (c: Caller) => !!c.key || !!c.scope || !!c.orgScope || isNarrowed(c);

/** Private collections where `where` says: what a workspace's scope doesn't reach (lib/access.ts). */
const privateCollections = (where: SQL) =>
  db
    .select({ id: collections.id, workspaceId: collections.workspaceId })
    .from(collections)
    .innerJoin(workspaces, eq(workspaces.id, collections.workspaceId))
    .where(and(eq(collections.private, true), where));

/** The workspace's private collections. */
export async function hiddenIn(workspaceId: string): Promise<string[]> {
  return (await privateCollections(eq(collections.workspaceId, workspaceId))).map((r) => r.id);
}

/** Workspaces a person can open: all of an organization they have a grant on, and any they have a grant in. */
const reachable = (userId: string) =>
  or(
    inArray(workspaces.organizationId, db.select({ id: grants.resourceId }).from(grants).where(and(eq(grants.userId, userId), eq(grants.resource, "organization")))),
    inArray(workspaces.id, db.select({ id: grants.workspaceId }).from(grants).where(eq(grants.userId, userId))),
  )!;

/** Every workspace a person can open, and their grants: one round trip. */
export async function workspacesOf(userId: string) {
  const [mine, open] = await Promise.all([db.select().from(grants).where(eq(grants.userId, userId)), workspacesWhere(reachable(userId))]);
  return { grants: mine, workspaces: open };
}

const cookie = (req: Request, name: string) =>
  req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);

const ipOf = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || null;

/**
 * Resolve the caller. A key that is presented but unknown is `undefined`, not
 * anonymous: a revoked key should fail loudly, never quietly fall back to
 * whatever anonymous may do. In a read-only organization everyone reads, and
 * its admins still manage its people and settings, and can leave.
 *
 * `workspaceId` asks for that workspace over the cookie's, when they can open
 * it: for what belongs to one workspace whichever is open, like /a/{id}.
 */
export async function callerFrom(req: Request, workspaceId?: string): Promise<Caller | undefined> {
  const caller = await resolve(req, workspaceId);
  if (!caller || !(await limitsOf(caller.workspace.organizationId)).readOnly) return caller;
  return { ...caller, ...capAt(caller, "read"), readOnly: true };
}

async function resolve(req: Request, workspaceId?: string): Promise<Caller | undefined> {
  const ip = ipOf(req);
  const authorization = req.headers.get("authorization");
  if (authorization) {
    const secret = authorization.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!secret) return undefined;
    // One secret, a row per workspace it was given: the one asked for, else the first.
    const rows = await db.select().from(apiKeys).where(eq(apiKeys.hash, hashKey(secret))).orderBy(asc(apiKeys.createdAt), asc(apiKeys.id));
    const key = rows.find((r) => r.workspaceId === workspaceId) ?? rows[0];
    if (!key) return undefined;
    // Connected agents' "last seen": never worth failing or slowing the request for.
    void db
      .update(apiKeys)
      .set({ lastUsedAt: new Date(), calls: sql`${apiKeys.calls} + 1` })
      .where(eq(apiKeys.id, key.id))
      .catch((err) => console.error("key use not recorded", err));
    const [[workspace], hidden, theirs] = await Promise.all([
      workspacesWhere(eq(workspaces.id, key.workspaceId)),
      hiddenIn(key.workspaceId),
      key.userId ? db.select().from(grants).where(eq(grants.userId, key.userId)) : null,
    ]);
    // An agent a person connected does what they can, up to what they gave it: lose the access, and so does it.
    const access = theirs ? capAt(accessIn(theirs, workspace, hidden), key.scope) : { scope: key.scope, narrow: NONE, off: NO_OFF, hidden };
    return { workspace, ...access, orgScope: null, actor: key.name, user: null, key: key.id, ip };
  }

  const wanted = workspaceId ?? cookie(req, WORKSPACE_COOKIE);
  const session = await auth.api.getSession({ headers: req.headers }).catch(() => null);
  if (session) {
    const { id, name, email } = session.user;
    // Private collections of every workspace they can open, alongside: which one they are in is known after.
    const [{ grants: mine, workspaces: open }, closed] = await Promise.all([workspacesOf(id), privateCollections(reachable(id))]);
    const workspace = open.find((w) => w.id === wanted) ?? open[0] ?? (await defaultWorkspace());
    const hidden = open.includes(workspace) ? closed.filter((c) => c.workspaceId === workspace.id).map((c) => c.id) : await hiddenIn(workspace.id);
    const orgScope = highest(
      ...mine.filter((g) => g.resource === "organization" && g.resourceId === workspace.organizationId).map((g) => g.scope),
    );
    return { workspace, ...accessIn(mine, workspace, hidden), orgScope, actor: name || email, user: { id, name, email }, key: null, ip };
  }

  // Someone signed out picks a workspace by cookie only where anyone may look around (anonymousScope): elsewhere
  // a workspace's id would show its name, its organization and its private collections' ids to whoever has it.
  // One the request is about (a public asset's) is still theirs to see it in.
  const scope = await anonymousScope();
  const pick = workspaceId ?? (scope ? wanted : undefined);
  const [picked] = pick && z.uuid().safeParse(pick).success ? await workspacesWhere(eq(workspaces.id, pick)) : [undefined];
  const workspace = picked ?? (await defaultWorkspace());
  return { workspace, scope, narrow: NONE, off: NO_OFF, hidden: await hiddenIn(workspace.id), orgScope: scope, actor: "web", user: null, key: null, ip };
}

export async function workspaceById(id: string): Promise<Workspace | null> {
  return (await workspacesWhere(eq(workspaces.id, id)))[0] ?? null;
}

/** Every workspace an anonymous caller with a scope can switch to: all of them. */
export const allWorkspaces = () => workspacesWhere();

/** Every workspace a key's secret is in, oldest row first, each with its scope there. */
export async function keyWorkspaces(keyId: string): Promise<(Workspace & { scope: Scope })[]> {
  const same = db.select({ hash: apiKeys.hash }).from(apiKeys).where(eq(apiKeys.id, keyId));
  return db
    .select({ ...ws, scope: apiKeys.scope })
    .from(apiKeys)
    .innerJoin(workspaces, eq(workspaces.id, apiKeys.workspaceId))
    .innerJoin(organizations, eq(organizations.id, workspaces.organizationId))
    .where(eq(apiKeys.hash, sql`(${same})`))
    .orderBy(asc(apiKeys.createdAt), asc(apiKeys.id));
}

/** Workspaces a caller can switch to, across organizations, for the switcher. */
export async function openWorkspaces(caller: Caller): Promise<Workspace[]> {
  if (caller.key) return keyWorkspaces(caller.key);
  if (caller.user) return (await workspacesOf(caller.user.id)).workspaces;
  return caller.scope ? allWorkspaces() : [];
}

/** GET /api/v1/me: who this is, where, what they may do, and how else one could sign in. */
export async function describeCaller(caller: Caller) {
  const here = placed(caller) ? caller.workspace : NOWHERE;
  const [email, workspaces, signUp, anonymous, passwordReset, sso, limits, notice, joinable] = await Promise.all([
    canEmail(here.organizationId),
    openWorkspaces(caller),
    hasUsers().then((some) => !some),
    anonymousScope(),
    canResetPasswords(),
    ssoOffered(),
    effective("limits", { organizationId: here.organizationId }),
    effective("notice", { organizationId: here.organizationId }),
    joinOffer(caller),
  ]);
  const admin = !!caller.user && caller.orgScope === "admin";
  return {
    user: caller.user,
    key: !!caller.key,
    actor: caller.actor,
    workspace: here,
    scope: caller.scope,
    orgScope: caller.orgScope,
    readOnly: !!caller.readOnly,
    narrowed: isNarrowed(caller),
    email,
    narrow: caller.narrow,
    off: caller.off,
    hidden: here === NOWHERE ? [] : caller.hidden,
    workspaces,
    features: limits.value.features,
    upgrade: upgradeUrl(env.BILLING_URL, admin, limits.source),
    billing: admin ? (env.BILLING_URL ?? null) : null,
    hub: !!env.HUB_URL,
    hubUrl: env.HUB_URL ? hubHome("private", env.APP_URL, env.HUB_URL) : null,
    // The operator's word to the organization's admins: they are who can act on it.
    notice: admin ? noticeOf(notice.value) : null,
    // An organization at the domain of their address they may join (lib/core/email-domains.ts).
    joinable,
    // Connecting makes a key for the sync, so it takes admin on the workspace.
    git: env.GIT_CONNECT_URL && !!caller.user && caller.scope === "admin" ? env.GIT_CONNECT_URL : null,
    // Help's "Send feedback" writes to the operator's reply address, with the version in the mail to say what ran.
    feedback: env.EMAIL_REPLY_TO && caller.user ? { email: env.EMAIL_REPLY_TO, version: pkg.version } : null,
    auth: {
      signUp,
      open: env.SIGNUP === "open",
      oidc: oidc && { name: oidc.name },
      google,
      sso,
      anonymous,
      passwordReset,
      serverEmail: lockedBy("email", process.env),
    },
  };
}
