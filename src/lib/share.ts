import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Share link secrets. The token is the link; a password, when set, is kept
 * as a salted scrypt hash. Relative imports only: `pnpm test` runs this
 * under plain Node.
 */

const derive = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

/** 144 random bits: unguessable, and short enough to read aloud in a pinch. */
export const shareToken = () => randomBytes(18).toString("base64url");

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("base64url")}$${(await derive(password, salt, 32)).toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [kind, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const want = Buffer.from(hash, "base64url");
  const got = await derive(password, Buffer.from(salt, "base64url"), want.length);
  return timingSafeEqual(got, want);
}

/** Why a link can't be opened right now: past its date, or it wants a password it wasn't given. Null: open it. */
export async function refusal(
  link: { expiresAt: Date | null; passwordHash: string | null },
  password: string | null | undefined,
  now = new Date(),
): Promise<"gone" | "password" | null> {
  if (link.expiresAt && link.expiresAt <= now) return "gone";
  if (link.passwordHash && !(password && (await verifyPassword(password, link.passwordHash)))) return "password";
  return null;
}
