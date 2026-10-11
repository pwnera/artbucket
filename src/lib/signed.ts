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

const mac = (secret: string, id: string, exp: number, by?: string) =>
  createHmac("sha256", secret)
    .update(by ? `asset-url:${id}.${exp}.${by}` : `asset-url:${id}.${exp}`)
    .digest("base64url")
    .slice(0, 22);

/** What handed a signature out, when it says: a portal (`p-{id}`) or a share link (`l-{id}`), checked again when it is used. */
const BY = /^[pl]-[0-9a-f-]{36}$/;

/**
 * The `s` value for an asset until `until`. `step` rounds the time up, so a
 * page asked for twice in a step hands out the same URLs, and caches keep them.
 * `by` names the portal or share link handing it out (`{exp}.{mac}.{by}`):
 * closed, revoked or turned off, its URLs stop at once rather than at `until`.
 */
export function signAsset(secret: string, id: string, until: Date, step = 0, by?: string) {
  let exp = Math.ceil(until.getTime() / 1000);
  if (step > 0) exp = Math.ceil(exp / step) * step;
  if (by && !BY.test(by)) throw new Error(`Not a signer: ${by}`);
  return `${exp}.${mac(secret, id, exp, by)}${by ? `.${by}` : ""}`;
}

/** A signature, if it is this asset's and not past: when it stops, and what handed it out; null otherwise. */
export function signature(secret: string, id: string, s: string | null, now = new Date()): { until: Date; by: string | null } | null {
  const [raw, got, by, ...more] = s?.split(".") ?? [];
  const exp = Number(raw);
  if (!got || more.length || (by !== undefined && !BY.test(by)) || !Number.isSafeInteger(exp) || exp * 1000 <= now.getTime()) return null;
  const want = Buffer.from(mac(secret, id, exp, by));
  const given = Buffer.from(got);
  return want.length === given.length && timingSafeEqual(want, given) ? { until: new Date(exp * 1000), by: by ?? null } : null;
}

/** When a signature stops, if it is this asset's and not past; null otherwise. */
export const signedUntil = (secret: string, id: string, s: string | null, now = new Date()): Date | null => signature(secret, id, s, now)?.until ?? null;

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
