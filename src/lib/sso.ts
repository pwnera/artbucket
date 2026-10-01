import { normalizeUrl, selectTokenEndpointAuthMethod, validateDiscoveryDocument } from "@better-auth/sso";

/**
 * An organization's single sign-on, the parts that need no database: what a
 * provider's discovery document becomes once saved, and whether an address
 * belongs to a domain. lib/core/sso.ts keeps it; better-auth's sso plugin
 * signs people in with it (lib/auth.ts).
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

/** A domain as sign-in compares it: lower case, no trailing dot. */
export const bareDomain = (raw: string) => raw.trim().toLowerCase().replace(/\.$/, "");

/** Whether an address is at the domain or under it: jo@acme.com and jo@eu.acme.com are acme.com's. */
export function atDomain(email: string, domain: string) {
  const at = bareDomain(email.split("@").at(-1) ?? "");
  const d = bareDomain(domain);
  return !!d && email.includes("@") && (at === d || at.endsWith(`.${d}`));
}

/** The domains an address is at, nearest first: jo@eu.acme.com is at eu.acme.com and acme.com. A provider at any of them is its. */
export function domainsOf(email: string) {
  if (!email.includes("@")) return [];
  const labels = bareDomain(email.split("@").at(-1) ?? "").split(".");
  return labels.slice(0, -1).map((_, i) => labels.slice(i).join(".")).filter((d) => !!d && !d.startsWith("."));
}

/** Where a provider publishes its endpoints (OpenID Connect Discovery). */
export const discoveryUrl = (issuer: string) => `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;

export type OidcConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  pkce: true;
  discoveryEndpoint: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksEndpoint: string;
  userInfoEndpoint?: string;
  tokenEndpointAuthentication: "client_secret_basic" | "client_secret_post";
  scopes: string[];
};

/**
 * What is kept of a provider: its client, and the endpoints its discovery
 * document names, so signing in never has to discover them again. Refuses a
 * document for another issuer, one missing an endpoint, and one only a
 * private key could use: a secret is all that is asked for.
 */
export function oidcConfigFrom(doc: Record<string, unknown>, issuer: string, client: { clientId: string; clientSecret: string }): OidcConfig {
  // The plugin's own checks: the endpoints it needs are there, and the issuer is the one asked for.
  validateDiscoveryDocument(doc as never, issuer);
  const url = (name: string) => {
    const u = normalizeUrl(name, String(doc[name]), issuer);
    if (new URL(u).protocol !== "https:") throw new Error(`The provider's ${name} is not https: ${u}`);
    return u;
  };
  const auth = selectTokenEndpointAuthMethod(doc as never);
  if (auth !== "client_secret_basic" && auth !== "client_secret_post") {
    throw new Error("The provider takes no client secret at its token endpoint: turn on client_secret_basic or client_secret_post for this app");
  }
  return {
    // As the document says it, trailing slash and all: id tokens' iss must match it exactly.
    issuer: String(doc.issuer),
    ...client,
    pkce: true,
    discoveryEndpoint: discoveryUrl(issuer),
    authorizationEndpoint: url("authorization_endpoint"),
    tokenEndpoint: url("token_endpoint"),
    jwksEndpoint: url("jwks_uri"),
    ...(doc.userinfo_endpoint ? { userInfoEndpoint: url("userinfo_endpoint") } : {}),
    tokenEndpointAuthentication: auth,
    // No offline_access: nothing here calls the provider after sign-in, so no refresh token is asked for.
    scopes: ["openid", "email", "profile"],
  };
}
