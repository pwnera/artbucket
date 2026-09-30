/**
 * Where the page loads an asset from: /a/{id}, plus `rest` (a rendition,
 * `?download`). People signed in are let in by their session; a visitor
 * without one, on a portal, by the signatures its page was handed
 * (lib/core/signing.ts), kept here for every URL built after.
 *
 * No crypto here: client code imports it. Relative imports only: `pnpm test`
 * runs it under plain Node.
 */

/** `path` with the signature added, whatever query it has already. */
export const withSignature = (path: string, s: string) => `${path}${path.includes("?") ? "&" : "?"}s=${s}`;

const signed = new Map<string, string>();

export const addSignatures = (sigs: Record<string, string> | undefined) => {
  for (const [id, s] of Object.entries(sigs ?? {})) signed.set(id, s);
};

export function assetUrl(id: string, rest = "") {
  const s = signed.get(id);
  return s ? withSignature(`/a/${id}${rest}`, s) : `/a/${id}${rest}`;
}

/**
 * The same file at /c/, which follows the asset to its current version
 * (app/c). For a link someone keeps: an embed, a doc. Not for a signed one:
 * a signature names this version only, so that stays at /a/.
 */
export const followingUrl = (path: string) => path.replace(/^\/a\//, "/c/");

/** Whether a link to it can follow it: approved and in use, so there is a current version for it to reach. */
export const canFollow = (asset: { state: string }) => asset.state === "active";
