import { asc, eq, inArray, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiKeys, grants, organizations, workspaces } from "@/lib/db/schema";
import { auth, oidc } from "@/lib/auth";
import { hashKey } from "@/lib/core/keys";
import { canResetPasswords } from "@/lib/core/mail";
import { hasUsers } from "@/lib/core/people";
import { accessIn, highest, isNarrowed, NONE, type Access } from "@/lib/access";
import { env } from "@/lib/env";
import type { Scope } from "@/lib/scopes";

/**
 * Who is calling, where, and what they may do there. Every request resolves
 * to one of three callers:
 *
 * - an API key: one workspace, one scope, named for history
 * - a signed-in person: the workspace in the `ab_workspace` cookie if they
 *   can open it, else their first; their scope is what their grants add up
 *   to there (lib/access.ts)
 * - nobody: ANONYMOUS_SCOPE, which unset is admin until the first account
 *   exists and nothing after
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
};

/** The web app's workspace switcher sets this; it holds a workspace id. */
export const WORKSPACE_COOKIE = "ab_workspace";

export async function anonymousScope(): Promise<Scope | null> {
  if (env.ANONYMOUS_SCOPE !== undefined) return env.ANONYMOUS_SCOPE;
  return (await hasUsers()) ? null : "admin";
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

/** The oldest workspace: where a caller with nowhere else to be lands. There is always one. */
async function defaultWorkspace() {
  const [first] = await workspacesWhere();
  if (!first) throw new Error("No workspace: run `pnpm db:migrate`");
  return first;
}

/** Every workspace a person can open: all of an organization they have a grant on, and any they have a grant in. */
export async function workspacesOf(userId: string) {
  const mine = await db.select().from(grants).where(eq(grants.userId, userId));
  const orgs = mine.filter((g) => g.resource === "organization").map((g) => g.resourceId);
  const inside = [...new Set(mine.flatMap((g) => (g.workspaceId ? [g.workspaceId] : [])))];
  const open =
    orgs.length || inside.length
      ? await workspacesWhere(
          or(orgs.length ? inArray(workspaces.organizationId, orgs) : undefined, inside.length ? inArray(workspaces.id, inside) : undefined),
        )
      : [];
  return { grants: mine, workspaces: open };
}

const cookie = (req: Request, name: string) =>
  req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);

const ipOf = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || null;

/**
 * Resolve the caller. A key that is presented but unknown is `undefined`, not
 * anonymous: a revoked key should fail loudly, never quietly fall back to
 * whatever anonymous may do.
 */
export async function callerFrom(req: Request): Promise<Caller | undefined> {
  const ip = ipOf(req);
  const authorization = req.headers.get("authorization");
  if (authorization) {
    const secret = authorization.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!secret) return undefined;
    const [key] = await db.select().from(apiKeys).where(eq(apiKeys.hash, hashKey(secret)));
    if (!key) return undefined;
    const [workspace] = await workspacesWhere(eq(workspaces.id, key.workspaceId));
    return { workspace, scope: key.scope, narrow: NONE, orgScope: null, actor: key.name, user: null, key: key.id, ip };
  }

  const wanted = cookie(req, WORKSPACE_COOKIE);
  const session = await auth.api.getSession({ headers: req.headers }).catch(() => null);
  if (session) {
    const { id, name, email } = session.user;
    const { grants: mine, workspaces: open } = await workspacesOf(id);
    const workspace = open.find((w) => w.id === wanted) ?? open[0] ?? (await defaultWorkspace());
    const orgScope = highest(
      ...mine.filter((g) => g.resource === "organization" && g.resourceId === workspace.organizationId).map((g) => g.scope),
    );
    return { workspace, ...accessIn(mine, workspace), orgScope, actor: name || email, user: { id, name, email }, key: null, ip };
  }

  const scope = await anonymousScope();
  const picked = wanted && z.uuid().safeParse(wanted).success ? (await workspacesWhere(eq(workspaces.id, wanted)))[0] : undefined;
  const workspace = picked ?? (await defaultWorkspace());
  return { workspace, scope, narrow: NONE, orgScope: scope, actor: "web", user: null, key: null, ip };
}

export async function workspaceById(id: string): Promise<Workspace | null> {
  return (await workspacesWhere(eq(workspaces.id, id)))[0] ?? null;
}

/** Every workspace an anonymous caller with a scope can switch to: all of them. */
export const allWorkspaces = () => workspacesWhere();

/** Workspaces a caller can switch to, across organizations, for the switcher. */
export async function openWorkspaces(caller: Caller): Promise<Workspace[]> {
  if (caller.key) return [caller.workspace];
  if (caller.user) return (await workspacesOf(caller.user.id)).workspaces;
  return caller.scope ? allWorkspaces() : [];
}

/** GET /api/v1/me: who this is, where, what they may do, and how else one could sign in. */
export async function describeCaller(caller: Caller) {
  return {
    user: caller.user,
    key: !!caller.key,
    actor: caller.actor,
    workspace: caller.workspace,
    scope: caller.scope,
    orgScope: caller.orgScope,
    narrowed: isNarrowed(caller),
    narrow: caller.narrow,
    workspaces: await openWorkspaces(caller),
    auth: {
      signUp: !(await hasUsers()),
      oidc: oidc && { name: oidc.name },
      anonymous: await anonymousScope(),
      passwordReset: await canResetPasswords(),
    },
  };
}
