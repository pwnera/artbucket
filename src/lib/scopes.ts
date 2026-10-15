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

/**
 * The same scopes as people's roles, one vocabulary for every picker and
 * badge. Ordered read to admin, as the ladder is.
 */
export const ROLES: { scope: Scope; label: string; hint: string }[] = [
  { scope: "read", label: "Viewer", hint: "Search, look, download" },
  { scope: "propose", label: "Contributor", hint: "Also upload and suggest; it waits for review" },
  { scope: "write", label: "Editor", hint: "Also edit, approve, delete, and share links" },
  { scope: "admin", label: "Admin", hint: "Also manage people and keys" },
];

export const roleName = (s: Scope) => ROLES.find((r) => r.scope === s)?.label ?? s;

export const allows = (have: Scope | null, need: Scope) =>
  have !== null && SCOPES.indexOf(have) >= SCOPES.indexOf(need);

/**
 * `ANONYMOUS_SCOPE`: what a request without a key or a session may do. "none"
 * means nothing; unset is undefined, which lib/core/access.ts reads as
 * nothing too.
 */
export function parseAnonymous(raw: string | undefined): Scope | null | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const v = raw.trim();
  if (v === "none") return null;
  if ((SCOPES as readonly string[]).includes(v)) return v as Scope;
  throw new Error(`ANONYMOUS_SCOPE must be none, ${SCOPES.join(", ")}; got "${v}"`);
}

/** What a person can grant an agent on the consent screen. Admin stays with keys an admin makes. */
export const GRANTABLE = ["propose", "read", "write"] as const satisfies readonly Scope[];
export type Grantable = (typeof GRANTABLE)[number];

/** The scope a request asks for (OAuth's space-separated `scope`): the first grantable one, or null. */
export const askedScope = (scope: string | null | undefined): Grantable | null =>
  scope?.split(" ").find((s): s is Grantable => (GRANTABLE as readonly string[]).includes(s)) ?? null;

/** What the consent screen picks first: the scope asked, brought down to the most the person may give. */
export const cappedScope = (asked: Grantable, max: Grantable): Grantable => (SCOPES.indexOf(asked) <= SCOPES.indexOf(max) ? asked : max);
