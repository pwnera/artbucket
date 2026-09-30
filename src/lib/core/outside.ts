import type { Caller } from "@/lib/core/access";
import type { Asset } from "@/lib/core/assets";
import { AssetError } from "@/lib/core/errors";
import { publicPortalsShowing } from "@/lib/core/portals";
import { makeSignedUrl, sigFor, validUntil } from "@/lib/core/signing";
import { env } from "@/lib/env";
import { deliverable, STATE_LABEL } from "@/lib/lifecycle";
import { can } from "@/lib/permissions";
import { withSignature } from "@/lib/signed";

/**
 * An asset's URLs for an agent (lib/mcp.ts), whose key opens /a/{id} but
 * whose tools often can't send it: a chat app's web fetch, a code sandbox.
 *
 * - `fetchUrl`: for the agent to open itself. Reading an asset is what read
 *   access is for, so it is signed for minutes, not handed on.
 * - `outsideUrl`: for people outside the library, when the asset is already
 *   theirs to see (public, or shown on a public portal) or the key may share.
 *   Otherwise it says what the person can do, for the agent to pass on.
 */

const FETCH = 15 * 60;
const DAY = 86400;

const at = (a: Asset, rest: string) => `${env.APP_URL}/a/${a.id}${rest}`;

/** A URL the agent itself can open for a few minutes; null for what isn't served signed (a proposal, a draft, expired). */
export function fetchUrl(a: Asset, rest = "") {
  if (!deliverable(a)) return null;
  if (a.public) return at(a, rest);
  // Five minutes a step: asked again soon, the same URL, and a cache keeps the rendition.
  return withSignature(at(a, rest), sigFor(a.id, FETCH, { step: 300 }));
}

/** What an agent says when an asset can't leave: why, and how the person can let it out. */
export function privateNote(a: Asset) {
  if (!deliverable(a)) {
    const why = a.state === "active" ? "in embargo" : STATE_LABEL[a.state].toLowerCase();
    return `It is ${why}: only an approved asset, unexpired and out of embargo, is served outside the library.`;
  }
  return (
    "It is private: not public, on no public portal, and this key can't share it (sharing takes Edit access that may share). " +
    "Ask the person to do one of these in Artbucket: make the asset public, for a logo or press image anyone may have; " +
    "add it to a public portal, in one of its collections or on a published brand page; share it and send you the link; " +
    "or reconnect you and pick Edit on the consent screen, if their own role may share."
  );
}

/** Where people outside can see it without a link from here: public, or the public portals showing it. */
export async function outsideReach(caller: Caller, a: Asset) {
  const portals = deliverable(a) && !a.public ? await publicPortalsShowing(caller.workspace.id, a.id) : [];
  const share = can(caller, "asset.share", a);
  return {
    public: a.public && deliverable(a),
    portals: portals.map(({ name, url }) => ({ name, url })),
    /** This key may make a signed URL of any length. */
    canShare: share && deliverable(a),
    note: !deliverable(a) || !(a.public || share || portals.length) ? privateNote(a) : null,
  };
}

/**
 * A URL anyone can open for about `expiresIn` seconds. Public: its plain URL.
 * With share: signed as asked. Shown on a public portal: signed as the portal
 * signs it for visitors: a day, rounded up to the hour, never past the portal's end.
 * Otherwise refused, saying what the person can do.
 */
export async function outsideUrl(caller: Caller, a: Asset, expiresIn: number, rest = "") {
  if (!deliverable(a)) throw new AssetError("invalid", privateNote(a));
  if (a.public) return { url: at(a, rest), expiresAt: null, via: "public" as const, portals: [] };
  if (can(caller, "asset.share", a)) {
    const signed = await makeSignedUrl(caller, a.id, expiresIn, rest);
    if (!signed) throw new AssetError("not_found", `No asset ${a.id}`);
    return { ...signed, via: "share" as const, portals: [] };
  }
  const portals = await publicPortalsShowing(caller.workspace.id, a.id);
  if (!portals.length) throw new AssetError("forbidden", `${privateNote(a)} To look at it yourself, open the fetchUrl rendition_url gives without expiresIn.`);
  // The longest any of them would sign it for.
  const until = portals.some((p) => !p.expiresAt) ? null : new Date(Math.max(...portals.map((p) => p.expiresAt!.getTime())));
  const s = sigFor(a.id, Math.min(expiresIn, DAY), { until });
  return {
    url: withSignature(at(a, rest), s),
    expiresAt: validUntil(a.id, s),
    via: "portal" as const,
    portals: portals.map(({ name, url }) => ({ name, url })),
  };
}
