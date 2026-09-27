/**
 * What a caller may do. Scopes are a ladder, each one including those below:
 *
 *   read      search, describe, fetch
 *   propose   also upload and suggest tags; what it writes waits for a human
 *   write     also edit, delete, promote, and change collections and fields
 *   admin     also mint and revoke API keys, and manage members and share links
 *
 * An agent gets `propose`: it can do real work, and nothing it does is final.
 */
export const SCOPES = ["read", "propose", "write", "admin"] as const;
export type Scope = (typeof SCOPES)[number];

export const allows = (have: Scope | null, need: Scope) =>
  have !== null && SCOPES.indexOf(have) >= SCOPES.indexOf(need);

/**
 * `ANONYMOUS_SCOPE`: what a request without a key or a session may do. "none"
 * means nothing; unset is undefined, which lib/core/access.ts reads as admin
 * until the first account exists and none after.
 */
export function parseAnonymous(raw: string | undefined): Scope | null | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const v = raw.trim();
  if (v === "none") return null;
  if ((SCOPES as readonly string[]).includes(v)) return v as Scope;
  throw new Error(`ANONYMOUS_SCOPE must be none, ${SCOPES.join(", ")}; got "${v}"`);
}
