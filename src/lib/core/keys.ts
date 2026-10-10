import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { apiKeys, assets, users, projects } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { recordAudit } from "@/lib/core/audit";
import { checkLimit } from "@/lib/core/usage";
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
  const keys = await keysWhere(and(eq(apiKeys.projectId, caller.project.id), mine(caller)));
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
    .where(and(eq(apiKeys.id, id), eq(apiKeys.projectId, caller.project.id), mine(caller)))
    .returning({ name: apiKeys.name, scope: apiKeys.scope });
  if (gone) await recordAudit(caller, "key.revoked", gone.name, { scope: gone.scope });
  return !!gone;
}
