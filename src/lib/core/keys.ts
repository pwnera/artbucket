import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { recordAudit } from "@/lib/core/audit";
import type { Scope } from "@/lib/scopes";

export const hashKey = (secret: string) => createHash("sha256").update(secret).digest("hex");

const PUBLIC = { id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, scope: apiKeys.scope, createdAt: apiKeys.createdAt };

/** A key for the caller's workspace. The secret is returned once, here, and never stored. */
export async function createKey(caller: Caller, input: { name: string; scope: Scope }) {
  const secret = `ab_${randomBytes(32).toString("base64url")}`;
  const [row] = await db
    .insert(apiKeys)
    .values({ ...input, workspaceId: caller.workspace.id, prefix: secret.slice(0, 10), hash: hashKey(secret) })
    .returning(PUBLIC);
  await recordAudit(caller, "key.created", row.name, { scope: row.scope });
  return { ...row, secret };
}

export const listKeys = (caller: Caller) =>
  db.select(PUBLIC).from(apiKeys).where(eq(apiKeys.workspaceId, caller.workspace.id)).orderBy(asc(apiKeys.createdAt));

export async function revokeKey(caller: Caller, id: string) {
  const [gone] = await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, id), eq(apiKeys.workspaceId, caller.workspace.id)))
    .returning(PUBLIC);
  if (gone) await recordAudit(caller, "key.revoked", gone.name, { scope: gone.scope });
  return !!gone;
}
