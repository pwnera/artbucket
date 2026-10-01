import assert from "node:assert/strict";
import { test } from "node:test";
import { atDomain, oidcConfigFrom } from "./sso.ts";

const client = { clientId: "id", clientSecret: "secret" };
const doc = {
  issuer: "https://acme.okta.com",
  authorization_endpoint: "https://acme.okta.com/oauth2/v1/authorize",
  token_endpoint: "https://acme.okta.com/oauth2/v1/token",
  jwks_uri: "https://acme.okta.com/oauth2/v1/keys",
  userinfo_endpoint: "https://acme.okta.com/oauth2/v1/userinfo",
  token_endpoint_auth_methods_supported: ["client_secret_post", "private_key_jwt"],
};

test("an address is a domain's when it is at it or under it, never at a look-alike", () => {
  assert.ok(atDomain("jo@acme.com", "acme.com"));
  assert.ok(atDomain("Jo@EU.Acme.com", "acme.com."));
  assert.ok(!atDomain("jo@notacme.com", "acme.com"));
  assert.ok(!atDomain("jo@acme.com.evil.io", "acme.com"));
  assert.ok(!atDomain("acme.com", "acme.com"));
  assert.ok(!atDomain("jo@acme.com", ""));
});

test("a discovery document becomes the endpoints kept, with a secret the token endpoint takes", () => {
  const c = oidcConfigFrom(doc, "https://acme.okta.com", client);
  assert.equal(c.tokenEndpoint, doc.token_endpoint);
  assert.equal(c.jwksEndpoint, doc.jwks_uri);
  assert.equal(c.userInfoEndpoint, doc.userinfo_endpoint);
  assert.equal(c.tokenEndpointAuthentication, "client_secret_post");
  assert.equal(c.discoveryEndpoint, "https://acme.okta.com/.well-known/openid-configuration");
  assert.deepEqual(c.scopes, ["openid", "email", "profile"]);
});

test("it refuses another issuer's document, a missing endpoint, plain http, and a provider only a private key opens", () => {
  assert.throws(() => oidcConfigFrom({ ...doc, issuer: "https://evil.example" }, "https://acme.okta.com", client));
  assert.throws(() => oidcConfigFrom({ ...doc, jwks_uri: undefined }, "https://acme.okta.com", client));
  assert.throws(() => oidcConfigFrom({ ...doc, token_endpoint: "http://acme.okta.com/token" }, "https://acme.okta.com", client));
  assert.throws(() => oidcConfigFrom({ ...doc, token_endpoint_auth_methods_supported: ["private_key_jwt"] }, "https://acme.okta.com", client), /client secret/);
});

test("the issuer is kept as the document says it, so a trailing slash still matches the id token's iss", () => {
  const auth0 = { ...doc, issuer: "https://acme.eu.auth0.com/" };
  const c = oidcConfigFrom(auth0, "https://acme.eu.auth0.com", client);
  assert.equal(c.issuer, "https://acme.eu.auth0.com/");
  assert.equal(c.discoveryEndpoint, "https://acme.eu.auth0.com/.well-known/openid-configuration");
});
