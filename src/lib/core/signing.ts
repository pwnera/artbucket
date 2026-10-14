import { assetLink } from "@/lib/asset-url";
import type { Caller } from "@/lib/core/access";
import { getAsset } from "@/lib/core/assets";
import { recordAudit } from "@/lib/core/audit";
import { AssetError } from "@/lib/core/errors";
import { env } from "@/lib/env";
import { deliverable } from "@/lib/lifecycle";
import { can, needs } from "@/lib/permissions";
import { signAsset, signature, signedUntil, withSignature } from "@/lib/signed";

/**
 * Asset bytes are private: /a/{id} serves people who can see the asset. The
 * rest of the world gets them through a signed URL (lib/signed.ts), which
 * share links and portals hand out for what they show, and a person makes
 * to send; or once the asset is made public.
 */

const HOUR = 3600;
const DAY = 24 * HOUR;

/** The `s` for an asset, for `seconds`, the same all `step`; never past `until`. `by`: the portal or share link handing it out. */
export function sigFor(id: string, seconds: number, { step = HOUR, until, by }: { step?: number; until?: Date | null; by?: string } = {}) {
  const end = new Date(Date.now() + seconds * 1000);
  // Rounding up could outlive what it is for: a link ending sooner ends the URL then.
  if (until && until < end) return signAsset(env.BETTER_AUTH_SECRET, id, until, 0, by);
  return signAsset(env.BETTER_AUTH_SECRET, id, end, step, by);
}

/** What signs for a portal, and for a share link: named in the signature, so /a/{id} asks it again (lib/core/signers.ts). */
export const byPortal = (portalId: string) => `p-${portalId}`;
export const byLink = (linkId: string) => `l-${linkId}`;

/**
 * For a page someone outside sees now (a share link, a portal): a day, the same all hour. `by` names that portal or
 * link, so its URLs stop the moment it closes, is revoked or turned off, not a day later.
 */
export const pageSig = (id: string, until?: Date | null, by?: string) => sigFor(id, DAY, { until, by });

/** For what outlives a page: the brand's logo on the sign-in screen, in email. */
export const longSig = (id: string, days: number) => sigFor(id, days * DAY, { step: DAY });

/** `/a/{id}` plus `rest` (a rendition, `?download`), signed for a page. */
export const pagePath = (id: string, rest = "", until?: Date | null, by?: string) => withSignature(`/a/${id}${rest}`, pageSig(id, until, by));

export const validUntil = (id: string, s: string | null) => signedUntil(env.BETTER_AUTH_SECRET, id, s);
/** A signature on this asset, not past: until when, and the portal or link that handed it out, if it says. */
export const signatureOf = (id: string, s: string | null) => signature(env.BETTER_AUTH_SECRET, id, s);

/**
 * POST /api/v1/assets/{id}/signed-url: a URL anyone can open until it
 * expires, for sharing it takes. Only an asset that may be used leaves.
 */
export async function makeSignedUrl(caller: Caller, id: string, expiresIn: number, rest = "") {
  const asset = await getAsset(caller, id);
  if (!asset) return null;
  if (!can(caller, "asset.share", asset)) throw new AssetError("forbidden", `Sharing it takes ${needs("asset.share")}`);
  if (!deliverable(asset)) throw new AssetError("invalid", "Only an approved asset, unexpired and out of embargo, can be shared");
  const expiresAt = new Date(Date.now() + expiresIn * 1000);
  await recordAudit(caller, "asset.signed_url", asset.filename, { expiresAt });
  return { url: withSignature(`${env.APP_URL}${assetLink(asset, rest)}`, signAsset(env.BETTER_AUTH_SECRET, asset.id, expiresAt)), expiresAt };
}
