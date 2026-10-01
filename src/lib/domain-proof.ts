import { getDomain } from "tldts";

// Server only: the public suffix list it reads is some 40 KB gzipped, kept out of lib/hub.ts, which pages load too.

/**
 * Whether a verified host proves a brand's domain: the domain itself or its
 * www twin, a name under it (brand.acme.com proves acme.com: only acme.com's
 * DNS admin makes it), or one above it (acme.com proves shop.acme.com). Never
 * across a public suffix, private section included: a zone that hands out
 * names to others (github.io, vercel.app, a dynamic DNS service) is no one's,
 * so acme.github.io proves itself and the names under it, never github.io or
 * a sibling.
 */
export function provesDomain(host: string, domain: string) {
  // www is a site's twin, not a public suffix's: www.duckdns.org is one name there, never duckdns.org.
  const site = getDomain(host, { allowPrivateDomains: true });
  const h = site && site !== host ? host.replace(/^www\./, "") : host;
  if (h === domain) return true;
  return (h.endsWith(`.${domain}`) || domain.endsWith(`.${h}`)) && site !== null && site === getDomain(domain, { allowPrivateDomains: true });
}

/**
 * Which of an organization's verified hosts proves a listing's domain, when
 * the listing's own organization proves none of it: the offer to claim it
 * (lib/core/hub-claims.ts). Null for no offer.
 */
export function claimProof(domain: string | null, claimant: string[], owner: string[]) {
  if (!domain || owner.some((h) => provesDomain(h, domain))) return null;
  return claimant.find((h) => provesDomain(h, domain)) ?? null;
}
