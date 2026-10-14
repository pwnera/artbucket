/**
 * Where the page loads an asset from: /a/{id}, plus `rest` (a rendition,
 * `?download`). People signed in are let in by their session; a visitor
 * without one, on a portal, by the signatures its page was handed
 * (lib/core/signing.ts), kept here for every URL built after.
 *
 * No crypto here: client code imports it. Relative imports only: `pnpm test`
 * runs it under plain Node.
 */

import { linkName } from "./filename.ts";
import { outputFormat, parseTransform } from "./transform.ts";

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

/** What names a link. A rule's file read without its file name or type (lib/rules.ts RuleAsset) goes unnamed. */
type Linked = { filename?: string | null; mime?: string; metadata?: { title?: string | null } | null; probe?: Record<string, unknown> | null };

/**
 * `rest` (a rendition, `?download`) with the asset's name after it, for a
 * link someone keeps: `/w_800,f_webp` is `/w_800,f_webp/summer-hero.webp`,
 * the extension the bytes', not the upload's. Only read by people:
 * splitLink drops it.
 */
export function withName(a: Linked, rest = "") {
  const q = rest.indexOf("?");
  const path = q < 0 ? rest : rest.slice(0, q);
  const t = path ? parseTransform(path.slice(1)) : null;
  if ((path && !t) || !a.filename || !a.mime) return rest;
  const format = t && outputFormat(t, { mime: a.mime, probe: a.probe });
  const name = linkName({ filename: a.filename, metadata: a.metadata }, format ? format.replace("jpeg", "jpg") : undefined);
  return `${path}${name ? `/${name}` : ""}${q < 0 ? "" : rest.slice(q)}`;
}

/** `/a/{id}` plus `rest`, named: /a/{id}/w_800,f_webp/summer-hero.webp. */
export const assetLink = (a: Linked & { id: string }, rest = "") => `/a/${a.id}${withName(a, rest)}`;

/**
 * What follows /a/{id}: a transform, a name, or one of each. A name has a
 * dot, which no transform has. It names nothing served: the id and the
 * transform say what that is, so a link made before names, or before a
 * rename, keeps working, and whatever extension it ends in changes nothing.
 * Either order: a rendition added to a named link, after it, is the same
 * rendition. Null for anything else (two of either, or more), which is a 400.
 */
export function splitLink(segments: string[] = []): { spec: string | null } | null {
  const specs = segments.filter((s) => !s.includes("."));
  if (segments.length > 2 || specs.length > 1 || segments.length - specs.length > 1) return null;
  return { spec: specs[0] ?? null };
}
