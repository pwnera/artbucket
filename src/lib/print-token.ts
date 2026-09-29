import { signAsset, signedUntil } from "./signed.ts";

/**
 * The token /print/{token} takes: which brand page to draw, for whom, until
 * when. Made by core/print.ts for its headless browser, and good for
 * minutes, so a leaked one shows a draft page for a moment, not the library.
 * Pure: `pnpm test` runs it under plain Node.
 */

export type PrintClaim = { ws: string; brand: string; page: string | null; context?: string; lang?: string };

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url").toString("utf8");

/** `payload.exp.mac`: the claim, then its signature (lib/signed.ts) over the payload. */
export function printToken(secret: string, claim: PrintClaim, seconds = 300): string {
  const payload = b64(JSON.stringify(claim));
  return `${payload}.${signAsset(secret, payload, new Date(Date.now() + seconds * 1000))}`;
}

/** The claim a token carries, when its signature is this server's and it hasn't expired; null otherwise. */
export function readPrintToken(secret: string, token: string, now = new Date()): PrintClaim | null {
  const dot = token.indexOf(".");
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  if (!signedUntil(secret, payload, token.slice(dot + 1), now)) return null;
  try {
    const c = JSON.parse(unb64(payload)) as PrintClaim;
    return typeof c.ws === "string" && typeof c.brand === "string" && (c.page === null || typeof c.page === "string") ? c : null;
  } catch {
    return null;
  }
}
