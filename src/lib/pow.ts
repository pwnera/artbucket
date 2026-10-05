/**
 * A proof-of-work check against scripted sign-ups, on ALTCHA's protocol
 * (altcha.org), with nothing third party: it works on any domain and loads
 * nothing from elsewhere. The server hands out a challenge, sha256(salt + n)
 * for a secret n up to `maxnumber`, with an expiry in the salt, signed with
 * its key; the browser tries each number until the hash matches, a second or
 * so of work, and sends the solution back, base64 JSON, in x-captcha-response.
 * Web Crypto only, so the same file runs on both sides: lib/auth.ts makes and
 * checks, components/sign-in.tsx solves.
 */

/** About 50,000 hashes on average: around a second on a phone, well under on a laptop. */
export const POW_MAX = 100_000;
/** How long a challenge may be solved and used. */
export const POW_TTL = 20 * 60_000;

export type Challenge = { algorithm: "SHA-256"; challenge: string; maxnumber: number; salt: string; signature: string };

const enc = new TextEncoder();
const hex = (b: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
const sha256 = async (s: string) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
const hmacKey = (secret: string) => crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

export async function makeChallenge(secret: string, now = Date.now(), maxnumber = POW_MAX): Promise<Challenge> {
  const salt = `${hex(crypto.getRandomValues(new Uint8Array(12)))}?expires=${Math.floor((now + POW_TTL) / 1000)}`;
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % (maxnumber + 1);
  const challenge = await sha256(salt + n);
  const signature = hex(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(challenge)));
  return { algorithm: "SHA-256", challenge, maxnumber, salt, signature };
}

// ponytail: challenges used, per process, until they expire; with several servers each would take one once (a shared table then).
const used = new Map<string, number>();

/** Why a solution is refused, or null when it holds. Each holds once. */
export async function verifySolution(secret: string, payload: string, now = Date.now()) {
  let s: Record<string, unknown>;
  try {
    s = JSON.parse(atob(payload));
  } catch {
    return "malformed";
  }
  const { algorithm, challenge, number, salt, signature } = s ?? {};
  if (algorithm !== "SHA-256" || typeof challenge !== "string" || typeof salt !== "string" || typeof signature !== "string" || !Number.isSafeInteger(number)) {
    return "malformed";
  }
  if (!/^[0-9a-f]{64}$/.test(signature)) return "forged";
  // Signed, and the salt is in the challenge: neither the expiry nor the number's range can be changed.
  const sig = Uint8Array.from(signature.match(/../g)!, (b) => parseInt(b, 16));
  if (!(await crypto.subtle.verify("HMAC", await hmacKey(secret), sig, enc.encode(challenge)))) return "forged";
  const expires = Number(new URLSearchParams(salt.split("?")[1] ?? "").get("expires")) * 1000;
  if (!(expires > now)) return "expired";
  if ((await sha256(salt + number)) !== challenge) return "wrong";
  for (const [c, until] of used) if (until <= now) used.delete(c);
  if (used.has(challenge)) return "replayed";
  used.set(challenge, expires);
  return null;
}

/**
 * The browser's half: every number until the hash matches, a thousand at a
 * time with a pause between, so the page keeps answering. The solution to
 * send, or null when `signal` aborts or nothing matches.
 */
export async function solve(c: Challenge, signal?: AbortSignal) {
  for (let start = 0; start <= c.maxnumber; start += 1000) {
    if (signal?.aborted) return null;
    const batch = await Promise.all(Array.from({ length: Math.min(1000, c.maxnumber + 1 - start) }, (_, i) => sha256(c.salt + (start + i))));
    const i = batch.indexOf(c.challenge);
    if (i >= 0) return btoa(JSON.stringify({ algorithm: c.algorithm, challenge: c.challenge, number: start + i, salt: c.salt, signature: c.signature }));
    await new Promise((r) => setTimeout(r, 0));
  }
  return null;
}
