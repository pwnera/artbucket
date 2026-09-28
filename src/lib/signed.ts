import { createHmac, timingSafeEqual } from "node:crypto";
export { withSignature } from "./asset-url.ts";

/**
 * Signed asset URLs: /a/{id}?s={exp}.{mac} serves an asset to whoever holds
 * the URL until `exp`, without an account. The signature covers the asset and
 * the time, not the rendition, so one signature serves every size of it.
 * Share links and portals hand these out; a person makes one to send.
 *
 * Relative imports only: `pnpm test` runs this under plain Node.
 */

const mac = (secret: string, id: string, exp: number) =>
  createHmac("sha256", secret).update(`asset-url:${id}.${exp}`).digest("base64url").slice(0, 22);

/**
 * The `s` value for an asset until `until`. `step` rounds the time up, so a
 * page asked for twice in a step hands out the same URLs, and caches keep them.
 */
export function signAsset(secret: string, id: string, until: Date, step = 0) {
  let exp = Math.ceil(until.getTime() / 1000);
  if (step > 0) exp = Math.ceil(exp / step) * step;
  return `${exp}.${mac(secret, id, exp)}`;
}

/** When a signature stops, if it is this asset's and not past; null otherwise. */
export function signedUntil(secret: string, id: string, s: string | null, now = new Date()): Date | null {
  const [raw, got] = s?.split(".") ?? [];
  const exp = Number(raw);
  if (!got || !Number.isSafeInteger(exp) || exp * 1000 <= now.getTime()) return null;
  const want = Buffer.from(mac(secret, id, exp));
  const given = Buffer.from(got);
  return want.length === given.length && timingSafeEqual(want, given) ? new Date(exp * 1000) : null;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * Every /a/{id} URL in `text` (rich text's images, as HTML or JSON) signed,
 * for the ids `sig` answers; others are left as they are.
 */
export function signUrlsIn(text: string, sig: (id: string) => string | null) {
  return text.replace(new RegExp(`(/a/(${UUID})(?:/[\\w,.]+)?)(\\?[^"'\\s<>\\\\]*)?`, "gi"), (all, path: string, id: string, query = "") => {
    const s = sig(id.toLowerCase());
    if (!s || /[?&]s=/.test(query)) return all;
    return `${path}${query ? `${query}&` : "?"}s=${s}`;
  });
}

/** The ids of every /a/{id} URL in `text`. */
export const assetIdsIn = (text: string) => [...new Set([...text.matchAll(new RegExp(`/a/(${UUID})`, "gi"))].map((m) => m[1].toLowerCase()))];
