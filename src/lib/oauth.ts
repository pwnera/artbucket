import { createHash, randomInt } from "node:crypto";
import { z } from "zod";
import { SCOPES, type Scope } from "./scopes.ts";

/**
 * The pure parts of the OAuth server (lib/core/oauth.ts): what a consent can
 * grant, PKCE, where a client may be sent back to, and device codes.
 *
 * Relative imports: `pnpm test` runs this under plain Node.
 */

/** What a person can grant an agent on the consent screen. Admin stays with keys an admin makes. */
export const GRANTABLE = ["propose", "read", "write"] as const satisfies readonly Scope[];
export type Grantable = (typeof GRANTABLE)[number];

/** The scope a request asks for (OAuth's space-separated `scope`): the first grantable one, or null. */
export const askedScope = (scope: string | null | undefined): Grantable | null =>
  scope?.split(" ").find((s): s is Grantable => (GRANTABLE as readonly string[]).includes(s)) ?? null;

/** What the consent screen picks first: the scope asked, brought down to the most the person may give. */
export const cappedScope = (asked: Grantable, max: Grantable): Grantable => (SCOPES.indexOf(asked) <= SCOPES.indexOf(max) ? asked : max);

/** What a person decides on the consent screen: a workspace and a scope, or no. */
export const Consent = z.discriminatedUnion("allow", [
  z.object({ allow: z.literal(true), workspace: z.uuid(), scope: z.enum(GRANTABLE) }),
  z.object({ allow: z.literal(false) }),
]);

/** PKCE, S256 only (RFC 7636): the verifier's SHA-256, base64url, is the challenge. */
export const pkceMatches = (verifier: string, challenge: string) =>
  /^[A-Za-z0-9._~-]{43,128}$/.test(verifier) && createHash("sha256").update(verifier).digest("base64url") === challenge;

/**
 * Where a client may ask to be sent back with a code: https anywhere, http
 * only to this machine (a CLI's or a desktop app's loopback listener), or an
 * app's own scheme (cursor://, vscode://). Never a scheme a browser would run.
 */
export function redirectAllowed(uri: string) {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.hash) return false;
  if (u.protocol === "https:") return true;
  if (u.protocol === "http:") return ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  return /^[a-z][a-z0-9+.-]*:$/.test(u.protocol) && !["javascript:", "data:", "file:", "vbscript:", "blob:"].includes(u.protocol);
}

/** No vowels, no look-alikes: a user code can't spell anything or be misread. */
const LETTERS = "BCDFGHJKLMNPQRSTVWXZ";

/** "WDJB-MJHT": what a person types on /device to approve the CLI. */
export const userCode = () => {
  const c = Array.from({ length: 8 }, () => LETTERS[randomInt(LETTERS.length)]).join("");
  return `${c.slice(0, 4)}-${c.slice(4)}`;
};

/** A typed code as it is stored: case and dashes don't matter. */
export const normalizeCode = (typed: string) => {
  const c = typed.toUpperCase().replace(/[^A-Z]/g, "");
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : null;
};
