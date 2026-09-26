import { createHash, randomBytes } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { env } from "@/lib/env";
import type { Scope } from "@/lib/scopes";

const hash = (secret: string) => createHash("sha256").update(secret).digest("hex");

const PUBLIC = { id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, scope: apiKeys.scope, createdAt: apiKeys.createdAt };

/** The secret is returned once, here, and never stored. */
export async function createKey(input: { name: string; scope: Scope }) {
  const secret = `ab_${randomBytes(32).toString("base64url")}`;
  const [row] = await db
    .insert(apiKeys)
    .values({ ...input, prefix: secret.slice(0, 10), hash: hash(secret) })
    .returning(PUBLIC);
  return { ...row, secret };
}

export const listKeys = () => db.select(PUBLIC).from(apiKeys).orderBy(asc(apiKeys.createdAt));

export async function revokeKey(id: string) {
  return (await db.delete(apiKeys).where(eq(apiKeys.id, id)).returning()).length > 0;
}

/** Who is calling: a key's scope, or the anonymous one. */
export type Caller = { scope: Scope | null; key: string | null };

/**
 * Resolve the caller from `Authorization: Bearer ab_...`. A key that is
 * presented but unknown is `undefined`, not anonymous: a revoked key should
 * fail loudly, never quietly fall back to whatever anonymous may do.
 */
export async function callerFrom(req: Request): Promise<Caller | undefined> {
  const auth = req.headers.get("authorization");
  if (!auth) return { scope: env.ANONYMOUS_SCOPE, key: null };
  const secret = auth.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!secret) return undefined;
  const [row] = await db.select(PUBLIC).from(apiKeys).where(eq(apiKeys.hash, hash(secret)));
  return row ? { scope: row.scope, key: row.id } : undefined;
}
