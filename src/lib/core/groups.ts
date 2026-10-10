import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { grants, groupMembers, groups, users } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { recordAudit } from "@/lib/core/audit";
import { AssetError } from "@/lib/core/errors";
import { labels, newEditors, presentGrant } from "@/lib/core/people";
import { checkLimit } from "@/lib/core/usage";
import { can } from "@/lib/permissions";

/**
 * Groups: people of one organization who share access. A grant held by a
 * group (lib/core/people.ts setGrant) is each member's, so a team gets
 * Editor on a project once and keeps it as people come and go. Its
 * admins make them; only members of the organization can be in one, and
 * leaving the organization leaves its groups.
 */

const manage = (caller: Caller) => {
  if (!can(caller, "organization.manage")) throw new AssetError("forbidden", "Only the organization's admins manage its groups");
};

export type Group = Awaited<ReturnType<typeof listGroups>>[number];

/** The organization's groups, each with its members and its grants. For whoever manages people. */
export async function listGroups(caller: Caller) {
  if (!can(caller, "member.manage")) throw new AssetError("forbidden", "You need admin on the workspace to see its groups");
  const org = caller.workspace.organizationId;
  const list = await db.select().from(groups).where(eq(groups.organizationId, org)).orderBy(asc(groups.name));
  if (!list.length) return [];
  const ids = list.map((g) => g.id);
  const [members, held] = await Promise.all([
    db
      .select({ groupId: groupMembers.groupId, id: users.id, name: users.name, email: users.email })
      .from(groupMembers)
      .innerJoin(users, eq(users.id, groupMembers.userId))
      .where(inArray(groupMembers.groupId, ids))
      .orderBy(asc(users.name)),
    db.select().from(grants).where(inArray(grants.groupId, ids)).orderBy(asc(grants.createdAt)),
  ]);
  const label = await labels(held);
  return list.map((g) => ({
    id: g.id,
    name: g.name,
    source: g.source,
    createdAt: g.createdAt,
    members: members.filter((m) => m.groupId === g.id).map(({ id, name, email }) => ({ id, name, email })),
    grants: held.filter((x) => x.groupId === g.id).map((x) => presentGrant(x, label(x.resourceId))),
  }));
}

async function groupOf(caller: Caller, id: string) {
  const [g] = await db.select().from(groups).where(and(eq(groups.id, id), eq(groups.organizationId, caller.workspace.organizationId)));
  if (!g) throw new AssetError("not_found", "No such group in this organization");
  return g;
}

export async function createGroup(caller: Caller, input: { name: string }) {
  manage(caller);
  const [g] = await db.insert(groups).values({ organizationId: caller.workspace.organizationId, name: input.name.trim() }).onConflictDoNothing().returning();
  if (!g) throw new AssetError("conflict", `There is a group called "${input.name}" already`);
  await recordAudit(caller, "group.created", g.name);
  return { id: g.id, name: g.name, source: g.source, createdAt: g.createdAt, members: [], grants: [] };
}

export async function renameGroup(caller: Caller, id: string, name: string) {
  manage(caller);
  const g = await groupOf(caller, id);
  const [row] = await db.update(groups).set({ name: name.trim() }).where(eq(groups.id, g.id)).returning();
  await recordAudit(caller, "group.renamed", row.name, { from: g.name });
  return { id: row.id, name: row.name };
}

/** Its grants go with it: its members keep only what they hold themselves. */
export async function deleteGroup(caller: Caller, id: string) {
  manage(caller);
  const g = await groupOf(caller, id);
  await db.delete(groups).where(eq(groups.id, g.id));
  await recordAudit(caller, "group.deleted", g.name);
  return true;
}

/**
 * Add and remove members. Only people of the organization: a group never
 * lets anyone in. Joining one whose grants make an editor takes a seat.
 */
export async function setGroupMembers(caller: Caller, id: string, change: { add?: string[]; remove?: string[] }) {
  manage(caller);
  const g = await groupOf(caller, id);
  const add = [...new Set(change.add ?? [])];
  if (add.length) {
    const inOrg = await db
      .selectDistinct({ id: grants.userId })
      .from(grants)
      .where(and(eq(grants.organizationId, g.organizationId), inArray(grants.userId, add)));
    const missing = add.filter((u) => !inOrg.some((m) => m.id === u));
    if (missing.length) throw new AssetError("not_found", "Only people of the organization can be in its groups; invite them first", { missing });
  }
  await db.transaction(async (tx) => {
    const editing = await tx.select({ id: grants.id }).from(grants).where(and(eq(grants.groupId, g.id), inArray(grants.scope, ["write", "admin"]))).limit(1);
    if (add.length && editing.length) await checkLimit(g.organizationId, "editors", { adding: await newEditors(tx, g.organizationId, g.id, add), tx });
    if (add.length) await tx.insert(groupMembers).values(add.map((userId) => ({ groupId: g.id, userId }))).onConflictDoNothing();
    if (change.remove?.length) await tx.delete(groupMembers).where(and(eq(groupMembers.groupId, g.id), inArray(groupMembers.userId, change.remove)));
  });
  await recordAudit(caller, "group.members", g.name, { added: add.length, removed: change.remove?.length ?? 0 });
  return (await listGroups(caller)).find((x) => x.id === g.id)!;
}
