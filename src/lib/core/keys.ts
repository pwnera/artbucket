import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { apiKeys, assets, users, projects } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { recordAudit } from "@/lib/core/audit";
import { requireFeature } from "@/lib/core/features";
import { checkLimit } from "@/lib/core/usage";
import { AssetError } from "@/lib/core/errors";
import { can } from "@/lib/permissions";
import type { Scope } from "@/lib/scopes";

export const hashKey = (secret: string) => createHash("sha256").update(secret).digest("hex");

/**
 * Keys as "Connected agents": who they are for, when they last called, and
 * what they left waiting in Review (proposals carry the key's name).
 */
const PUBLIC = {
  id: apiKeys.id,
  name: apiKeys.name,
  prefix: apiKeys.prefix,
  scope: apiKeys.scope,
  createdAt: apiKeys.createdAt,
  lastUsedAt: apiKeys.lastUsedAt,
  calls: apiKeys.calls,
  owner: users.name,
  waiting: sql<number>`(select count(*)::int from ${assets} where ${assets.projectId} = ${apiKeys.projectId} and ${assets.status} = 'proposed' and ${assets.deletedAt} is null and ${assets.proposedBy} = ${apiKeys.name})`,
};

/** A key for the caller's project. The secret is returned once, here, and never stored. */
export async function createKey(caller: Caller, input: { name: string; scope: Scope }) {
  await checkLimit(caller.project.organizationId, "agents");
  await requireFeature("agents", { organizationId: caller.project.organizationId, projectId: caller.project.id });
  const secret = `ab_${randomBytes(32).toString("base64url")}`;
  const [row] = await db
    .insert(apiKeys)
    .values({ ...input, projectId: caller.project.id, prefix: secret.slice(0, 10), hash: hashKey(secret) })
    .returning({ id: apiKeys.id });
  await recordAudit(caller, "key.created", input.name, { scope: input.scope });
  const [key] = await keysWhere(eq(apiKeys.id, row.id));
  return { ...key, secret };
}

/** An admin manages every key in the project; anyone else, the agents they connected. */
const mine = (caller: Caller) =>
  can(caller, "key.manage") ? undefined : caller.user ? eq(apiKeys.userId, caller.user.id) : sql`false`;

const keysWhere = (where?: SQL) =>
  db.select(PUBLIC).from(apiKeys).leftJoin(users, eq(users.id, apiKeys.userId)).where(where).orderBy(asc(apiKeys.createdAt));

/** The other rows of a key's secret: an agent connected to several projects. */
const sibling = alias(apiKeys, "sibling");

/**
 * The project's keys. An agent the caller connected also names every
 * project it works in, so Connections shows one connected to several;
 * nobody else's says where else it reaches.
 */
export async function listKeys(caller: Caller) {
  // A feature's own key is its switch's to make and revoke (lib/core/features.ts), not an agent here.
  const keys = await keysWhere(and(eq(apiKeys.projectId, caller.project.id), isNull(apiKeys.feature), mine(caller)));
  const theirs = caller.user
    ? await db
        .select({ id: apiKeys.id, name: projects.name })
        .from(apiKeys)
        .innerJoin(sibling, eq(sibling.hash, apiKeys.hash))
        .innerJoin(projects, eq(projects.id, sibling.projectId))
        .where(and(eq(apiKeys.projectId, caller.project.id), eq(apiKeys.userId, caller.user.id)))
        .orderBy(asc(sibling.createdAt))
    : [];
  return keys.map((k) => ({ ...k, projects: theirs.some((t) => t.id === k.id) ? theirs.filter((t) => t.id === k.id).map((t) => t.name) : null }));
}

export async function revokeKey(caller: Caller, id: string) {
  const [gone] = await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, id), eq(apiKeys.projectId, caller.project.id), isNull(apiKeys.feature), mine(caller)))
    .returning({ name: apiKeys.name, scope: apiKeys.scope });
  if (gone) await recordAudit(caller, "key.revoked", gone.name, { scope: gone.scope });
  return !!gone;
}

/**
 * A job token: a feature's background work done as the person who started it (a brand import's Apply, carried on
 * after they leave the page). Made from their session only, for the feature the request names (Artbucket-Feature,
 * on in the project), it acts with exactly their access there, in this project only, until it expires or the job
 * revokes it; turning the feature off revokes it too. It is the feature's, so Connections doesn't list it.
 */
export async function createJobToken(caller: Caller, input: { name: string; minutes: number }) {
  if (!caller.user || caller.key) throw new AssetError("forbidden", "A job token is made from a signed-in person's session");
  if (!caller.feature) throw new AssetError("forbidden", "A job token is made for a feature: send Artbucket-Feature");
  const secret = `ab_${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + input.minutes * 60_000);
  const name = `${caller.actor} · ${input.name}`.slice(0, 120);
  // "admin" caps nothing: a key with a person is held to what they can do (lib/core/access.ts), no more.
  const [row] = await db
    .insert(apiKeys)
    .values({ name, scope: "admin", projectId: caller.project.id, userId: caller.user.id, feature: caller.feature, prefix: secret.slice(0, 10), hash: hashKey(secret), expiresAt })
    .returning({ id: apiKeys.id });
  await recordAudit(caller, "key.created", name, { via: "job", feature: caller.feature, expiresAt: expiresAt.toISOString() });
  return { id: row.id, token: secret, expiresAt: expiresAt.toISOString() };
}

/** The job token presenting itself, revoked: its job is done. Any other key or caller has none to revoke. */
export async function revokeJobToken(caller: Caller) {
  if (!caller.key) return false;
  const [gone] = await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, caller.key), isNotNull(apiKeys.userId), isNotNull(apiKeys.feature), isNotNull(apiKeys.expiresAt)))
    .returning({ name: apiKeys.name });
  if (gone) await recordAudit(caller, "key.revoked", gone.name, { via: "job" });
  return !!gone;
}
