import { createHash, randomInt } from "node:crypto";
import { z } from "zod";
import { GRANTABLE } from "./scopes.ts";

/**
 * The pure parts of the OAuth server (lib/core/oauth.ts): what a consent can
 * grant, PKCE, where a client may be sent back to, and device codes.
 *
 * Relative imports: `pnpm test` runs this under plain Node.
 */

// Here too for the server's callers; they live in scopes.ts, which a page in the browser may import.
export { askedScope, cappedScope, GRANTABLE, type Grantable } from "./scopes.ts";

/** What a person decides on the consent screen: the projects and a scope, or no. */
export const Consent = z.discriminatedUnion("allow", [
  z.object({
    allow: z.literal(true),
    projects: z.array(z.uuid()).max(100).optional(),
    /** Deprecated: one project, from before an agent could be given several. */
    project: z.uuid().optional(),
    scope: z.enum(GRANTABLE),
  }),
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

/** A token request's fields as JSON sent them: strings only, so a number or an object is as if left out. */
export const formFields = (raw: unknown): Record<string, string> =>
  raw && typeof raw === "object" && !Array.isArray(raw)
    ? Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === "string"))
    : {};

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
