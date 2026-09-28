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
