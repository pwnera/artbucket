import { and, asc, eq, gt, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import pkg from "../../../package.json" with { type: "json" };
import { db } from "@/lib/db";
import { apiKeys, brands, collections, grants, groupMembers, organizations, projects } from "@/lib/db/schema";
import { unionAll } from "drizzle-orm/pg-core";
import { auth, captchaAtHost, google, oidc } from "@/lib/auth";
import { joinOffer } from "@/lib/core/email-domains";
import { hashKey } from "@/lib/core/keys";
import { canEmail, canResetPasswords } from "@/lib/core/mail";
import { hasUsers } from "@/lib/core/people";
import { ssoOffered } from "@/lib/core/sso";
import { effective } from "@/lib/core/settings";
import { limitsOf } from "@/lib/core/usage";
import { accessIn, capAt, highest, isNarrowed, NONE, type Access } from "@/lib/access";
import { env } from "@/lib/env";
import { ipOf } from "@/lib/client-ip";
import { hubHome } from "@/lib/hub";
import { memo } from "@/lib/memo";
import { upgradeUrl } from "@/lib/limits";
import { lockedBy, noticeOf } from "@/lib/settings";
import type { Scope } from "@/lib/scopes";

/**
 * Who is calling, where, and what they may do there. Every request resolves
 * to one of three callers:
 *
 * - an API key: one project, one scope, named for history. One a person
 *   connected (OAuth, `artbucket login`) is also held to what they can do,
 *   and may be in several projects, a row each: the one asked for, else
 *   the oldest
 * - a signed-in person: the project in the `ab_project` cookie if they
 *   can open it, else their first; their scope is what their grants add up
 *   to there (lib/access.ts)
 * - nobody: ANONYMOUS_SCOPE, which unset is nothing
 *
 * Until the first account exists nothing works at all (lib/api.ts): the
 * app asks for that account first, and it becomes the admin.
 */

export type Project = {
  id: string;
  slug: string;
  name: string;
  organizationId: string;
  organization: { id: string; slug: string; name: string };
};
export type Person = { id: string; name: string; email: string };

export type Caller = Access & {
  project: Project;
  /** On the project's organization: admin there manages its people and projects. */
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

/** The web app's project switcher sets this; it holds a project id. */
export const PROJECT_COOKIE = "ab_project";

/** Nothing before the first account exists, whatever ANONYMOUS_SCOPE says: setup comes first. */
export async function anonymousScope(): Promise<Scope | null> {
  return (await hasUsers()) ? (env.ANONYMOUS_SCOPE ?? null) : null;
}

const ws = {
  id: projects.id,
  slug: projects.slug,
  name: projects.name,
  organizationId: projects.organizationId,
  organization: { id: organizations.id, slug: organizations.slug, name: organizations.name },
};

function projectsWhere(where?: SQL): Promise<Project[]> {
  return db
    .select(ws)
    .from(projects)
    .innerJoin(organizations, eq(organizations.id, projects.organizationId))
    .where(where)
    .orderBy(asc(organizations.createdAt), asc(projects.createdAt));
}

/**
 * The oldest project: where a caller with nowhere else to be lands. There
 * is always one. Kept a minute (lib/memo.ts); deleting a project forgets it.
 */
export const defaultProject = memo(60_000, async () => {
  const [first] = await projectsWhere();
  if (!first) throw new Error("No project: run `pnpm db:migrate`");
  return first;
});

const NIL = "00000000-0000-0000-0000-000000000000";

/**
 * Where /me says a caller who can open no project is: nowhere. Never the
 * project they fell back to (the oldest), whose name and organization are
 * someone else's.
 */
const NOWHERE: Project = { id: NIL, slug: "", name: "", organizationId: NIL, organization: { id: NIL, slug: "", name: "" } };

/** The caller can open their project: a key, a scope there or on its organization, or grants inside it. */
export const placed = (c: Caller) => !!c.key || !!c.scope || !!c.orgScope || isNarrowed(c);

/** Private collections and brands where `where` says: what a project's scope doesn't reach (lib/access.ts). */
const privateCollections = (where: SQL) =>
  unionAll(
    db
      .select({ id: collections.id, projectId: collections.projectId })
      .from(collections)
      .innerJoin(projects, eq(projects.id, collections.projectId))
      .where(and(eq(collections.private, true), where)),
    db
      .select({ id: brands.id, projectId: brands.projectId })
      .from(brands)
      .innerJoin(projects, eq(projects.id, brands.projectId))
      .where(and(eq(brands.private, true), where)),
  );

/** The project's private collections and brands. */
export async function hiddenIn(projectId: string): Promise<string[]> {
  return (await privateCollections(eq(projects.id, projectId))).map((r) => r.id);
}

/** A person's own grants, and their groups' (lib/core/groups.ts). */
const ownOrGroups = (userId: string) =>
  or(eq(grants.userId, userId), inArray(grants.groupId, db.select({ id: groupMembers.groupId }).from(groupMembers).where(eq(groupMembers.userId, userId))))!;

/**
 * The grants a person holds: their own, their groups', and the shares held by
 * every project they are a member of (a role on it, or on its organization):
 * a share is each member's read on what was shared (lib/core/project-shares.ts).
 */
export const heldBy = (userId: string) => {
  const roles = (resource: "project" | "organization") =>
    db.select({ id: grants.resourceId }).from(grants).where(and(ownOrGroups(userId), eq(grants.resource, resource)));
  const memberOf = db
    .select({ id: projects.id })
    .from(projects)
    .where(or(inArray(projects.id, roles("project")), inArray(projects.organizationId, roles("organization"))));
  return or(ownOrGroups(userId), inArray(grants.holderProjectId, memberOf))!;
};

/** Projects a person can open: all of an organization they have a grant on, and any they have a grant in. */
const reachable = (userId: string) =>
  or(
    inArray(projects.organizationId, db.select({ id: grants.resourceId }).from(grants).where(and(heldBy(userId), eq(grants.resource, "organization")))),
    inArray(projects.id, db.select({ id: grants.projectId }).from(grants).where(heldBy(userId))),
  )!;

/** Every project a person can open, and their grants: one round trip. */
export async function projectsOf(userId: string) {
  const [mine, open] = await Promise.all([db.select().from(grants).where(heldBy(userId)), projectsWhere(reachable(userId))]);
  return { grants: mine, projects: open };
}

const cookie = (req: Request, name: string) =>
  req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);

/** The client's address, as the reverse proxies TRUSTED_PROXIES names report it. */
export { ipOf };

/**
 * Resolve the caller. A key that is presented but unknown or expired is `undefined`, not
 * anonymous: a revoked key should fail loudly, never quietly fall back to
 * whatever anonymous may do. In a read-only organization everyone reads, and
 * its admins still manage its people and settings, and can leave.
 *
 * `projectId` asks for that project over the cookie's, when they can open
 * it: for what belongs to one project whichever is open, like /a/{id}.
 */
export async function callerFrom(req: Request, projectId?: string): Promise<Caller | undefined> {
  const caller = await resolve(req, projectId);
  if (!caller || !(await limitsOf(caller.project.organizationId)).readOnly) return caller;
  return { ...caller, ...capAt(caller, "read"), readOnly: true };
}

async function resolve(req: Request, projectId?: string): Promise<Caller | undefined> {
  const ip = ipOf(req.headers);
  const authorization = req.headers.get("authorization");
  if (authorization) {
    const secret = authorization.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!secret) return undefined;
    // One secret, a row per project it was given: the one asked for, else the first. An agent's lapses (lib/core/oauth.ts).
    const rows = await db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.hash, hashKey(secret)), or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, sql`now()`))))
      .orderBy(asc(apiKeys.createdAt), asc(apiKeys.id));
    const key = rows.find((r) => r.projectId === projectId) ?? rows[0];
    if (!key) return undefined;
    // Connected agents' "last seen": never worth failing or slowing the request for.
    void db
      .update(apiKeys)
      .set({ lastUsedAt: new Date(), calls: sql`${apiKeys.calls} + 1` })
      .where(eq(apiKeys.id, key.id))
      .catch((err) => console.error("key use not recorded", err));
    const [[project], hidden, theirs] = await Promise.all([
      projectsWhere(eq(projects.id, key.projectId)),
      hiddenIn(key.projectId),
      key.userId ? db.select().from(grants).where(heldBy(key.userId)) : null,
    ]);
    // An agent a person connected does what they can, up to what they gave it: lose the access, and so does it.
    const access = theirs ? capAt(accessIn(theirs, project, hidden), key.scope) : { scope: key.scope, narrow: NONE, hidden };
    return { project, ...access, orgScope: null, actor: key.name, user: null, key: key.id, ip };
  }

  const wanted = projectId ?? cookie(req, PROJECT_COOKIE);
  const session = await auth.api.getSession({ headers: req.headers }).catch(() => null);
  if (session) {
    const { id, name, email } = session.user;
    // Private collections of every project they can open, alongside: which one they are in is known after.
    const [{ grants: mine, projects: open }, closed] = await Promise.all([projectsOf(id), privateCollections(reachable(id))]);
    const project = open.find((w) => w.id === wanted) ?? open[0] ?? (await defaultProject());
    const hidden = open.includes(project) ? closed.filter((c) => c.projectId === project.id).map((c) => c.id) : await hiddenIn(project.id);
    const orgScope = highest(
      ...mine.filter((g) => g.resource === "organization" && g.resourceId === project.organizationId).map((g) => g.scope),
    );
    return { project, ...accessIn(mine, project, hidden), orgScope, actor: name || email, user: { id, name, email }, key: null, ip };
  }

  // Someone signed out picks a project by cookie only where anyone may look around (anonymousScope): elsewhere
  // a project's id would show its name, its organization and its private collections' ids to whoever has it.
  // One the request is about (a public asset's) is still theirs to see it in.
  const scope = await anonymousScope();
  const pick = projectId ?? (scope ? wanted : undefined);
  const [picked] = pick && z.uuid().safeParse(pick).success ? await projectsWhere(eq(projects.id, pick)) : [undefined];
  const project = picked ?? (await defaultProject());
  return { project, scope, narrow: NONE, hidden: await hiddenIn(project.id), orgScope: scope, actor: "web", user: null, key: null, ip };
}

export async function projectById(id: string): Promise<Project | null> {
  return (await projectsWhere(eq(projects.id, id)))[0] ?? null;
}

/** Every project an anonymous caller with a scope can switch to: all of them. */
export const allProjects = () => projectsWhere();

/** Every project a key's secret is in, oldest row first, each with its scope there. */
export async function keyProjects(keyId: string): Promise<(Project & { scope: Scope })[]> {
  const same = db.select({ hash: apiKeys.hash }).from(apiKeys).where(eq(apiKeys.id, keyId));
  return db
    .select({ ...ws, scope: apiKeys.scope })
    .from(apiKeys)
    .innerJoin(projects, eq(projects.id, apiKeys.projectId))
    .innerJoin(organizations, eq(organizations.id, projects.organizationId))
    .where(eq(apiKeys.hash, sql`(${same})`))
    .orderBy(asc(apiKeys.createdAt), asc(apiKeys.id));
}

/** Projects a caller can switch to, across organizations, for the switcher. */
export async function openProjects(caller: Caller): Promise<Project[]> {
  if (caller.key) return keyProjects(caller.key);
  if (caller.user) return (await projectsOf(caller.user.id)).projects;
  return caller.scope ? allProjects() : [];
}

/** GET /api/v1/me: who this is, where, what they may do, and how else one could sign in, at the host asked. */
export async function describeCaller(caller: Caller, host?: string | null) {
  const here = placed(caller) ? caller.project : NOWHERE;
  const [email, projects, signUp, anonymous, passwordReset, sso, limits, notice, joinable, captcha] = await Promise.all([
    canEmail(here.organizationId),
    openProjects(caller),
    hasUsers().then((some) => !some),
    anonymousScope(),
    canResetPasswords(),
    ssoOffered(),
    effective("limits", { organizationId: here.organizationId }),
    effective("notice", { organizationId: here.organizationId }),
    joinOffer(caller),
    captchaAtHost(host),
  ]);
  const admin = !!caller.user && caller.orgScope === "admin";
  return {
    user: caller.user,
    key: !!caller.key,
    actor: caller.actor,
    project: here,
    scope: caller.scope,
    orgScope: caller.orgScope,
    readOnly: !!caller.readOnly,
    narrowed: isNarrowed(caller),
    email,
    narrow: caller.narrow,
    hidden: here === NOWHERE ? [] : caller.hidden,
    projects,
    features: limits.value.features,
    upgrade: upgradeUrl(env.BILLING_URL, admin, limits.source),
    billing: admin ? (env.BILLING_URL ?? null) : null,
    hub: !!env.HUB_URL,
    hubUrl: env.HUB_URL ? hubHome("private", env.APP_URL, env.HUB_URL) : null,
    // The operator's word to the organization's admins: they are who can act on it.
    notice: admin ? noticeOf(notice.value) : null,
    // An organization at the domain of their address they may join (lib/core/email-domains.ts).
    joinable,
    // Connecting makes a key for the sync, so it takes admin on the project.
    git: env.GIT_CONNECT_URL && !!caller.user && caller.scope === "admin" ? env.GIT_CONNECT_URL : null,
    // Help's "Send feedback" writes to the operator's reply address, with the version in the mail to say what ran.
    feedback: env.EMAIL_REPLY_TO && caller.user ? { email: env.EMAIL_REPLY_TO, version: pkg.version } : null,
    auth: {
      signUp,
      setupToken: signUp && !!env.SETUP_TOKEN,
      open: env.SIGNUP === "open",
      oidc: oidc && { name: oidc.name },
      google,
      sso,
      anonymous,
      passwordReset,
      serverEmail: lockedBy("email", process.env),
      captcha,
      turnstile: captcha === "turnstile" ? (env.TURNSTILE_SITE_KEY ?? null) : null,
      legal: env.TERMS_URL || env.PRIVACY_URL ? { terms: env.TERMS_URL ?? null, privacy: env.PRIVACY_URL ?? null } : null,
    },
  };
}
