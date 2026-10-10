import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { request, signUp } from "@/test/db";
import { callerFrom } from "@/lib/core/access";
import { checkAuthorize, decideAuthorize, exchange, mcpUrl, registerClient, sweepTokens } from "@/lib/core/oauth";
import { db } from "@/lib/db";
import { apiKeys, oauthClients } from "@/lib/db/schema";

const ada = await signUp("Ada");
const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const REDIRECT = "https://agent.example/callback";

/** An agent connects as Claude does: it registers, the person consents, it trades the code. */
async function connect(grantTypes: string[], resource?: string) {
  const client = await registerClient({ client_name: "Agent", redirect_uris: [REDIRECT], grant_types: grantTypes });
  const params = {
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: REDIRECT,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    ...(resource && { resource }),
  };
  const { redirect } = await decideAuthorize(ada.caller, params, { allow: true, projects: [ada.caller.project.id], scope: "propose" });
  const code = new URL(redirect).searchParams.get("code")!;
  const token = await exchange({ grant_type: "authorization_code", code, client_id: client.client_id, redirect_uri: REDIRECT, code_verifier: verifier, ...(resource && { resource }) });
  return { client: client.client_id, ...token };
}

const as = (token: string) => callerFrom(request({ authorization: `Bearer ${token}` }));
const refuses = (p: Promise<unknown>, error: string) => assert.rejects(p, (e: { error?: string }) => e.error === error);

test("a token works for an hour, then not at all", async () => {
  const t = await connect(["authorization_code", "refresh_token"], mcpUrl());
  assert.equal(t.expires_in, 3600);
  assert.ok(t.refresh_token);
  assert.equal((await as(t.access_token))?.scope, "propose");
  await db.update(apiKeys).set({ expiresAt: sql`now() - interval '1 second'` }).where(eq(apiKeys.clientId, t.client));
  assert.equal(await as(t.access_token), undefined);
});

test("a refresh token renews it once, for its own client only, and the old token stops working", async () => {
  const t = await connect(["authorization_code", "refresh_token"]);
  const [before] = await db.select({ id: apiKeys.id }).from(apiKeys).where(eq(apiKeys.clientId, t.client));
  await refuses(exchange({ grant_type: "refresh_token", refresh_token: t.refresh_token!, client_id: "abc_someone_else" }), "invalid_grant");
  const next = await exchange({ grant_type: "refresh_token", refresh_token: t.refresh_token!, client_id: t.client });
  assert.notEqual(next.access_token, t.access_token);
  assert.notEqual(next.refresh_token, t.refresh_token);
  assert.equal(next.scope, "propose");
  assert.equal(await as(t.access_token), undefined);
  assert.equal((await as(next.access_token))?.key, before.id, "the same connection, renewed in place");
  await refuses(exchange({ grant_type: "refresh_token", refresh_token: t.refresh_token!, client_id: t.client }), "invalid_grant");
});

test("a client that didn't register for refresh gets a month and nothing to renew", async () => {
  const t = await connect(["authorization_code"]);
  assert.equal(t.expires_in, 30 * 86_400);
  assert.equal(t.refresh_token, undefined);
});

test("a resource other than this server's API is refused", async () => {
  const client = await registerClient({ redirect_uris: [REDIRECT] });
  const params = { response_type: "code", client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: "x".repeat(43), code_challenge_method: "S256" };
  await assert.rejects(checkAuthorize(ada.caller, { ...params, resource: "https://elsewhere.example/api/v1/mcp" }), /Tokens here are for/);
  await assert.rejects(checkAuthorize(ada.caller, { ...params, resource: `${mcpUrl()}/../other` }), /Tokens here are for/);
  assert.ok(await checkAuthorize(ada.caller, { ...params, resource: `${mcpUrl()}/` }));
  await refuses(exchange({ grant_type: "refresh_token", refresh_token: "x", client_id: client.client_id, resource: "https://elsewhere.example" }), "invalid_target");
});

test("the sweep takes tokens past renewal, and clients long unused that hold none", async () => {
  const t = await connect(["authorization_code", "refresh_token"]);
  await db
    .update(apiKeys)
    .set({ expiresAt: sql`now() - interval '1 second'`, refreshExpiresAt: sql`now() - interval '1 second'` })
    .where(eq(apiKeys.clientId, t.client));
  const abandoned = await registerClient({ redirect_uris: [REDIRECT] });
  await db.update(oauthClients).set({ createdAt: sql`now() - interval '8 days'` }).where(eq(oauthClients.id, abandoned.client_id));
  const live = await connect(["authorization_code", "refresh_token"]);
  await db.update(oauthClients).set({ usedAt: sql`now() - interval '91 days'` }).where(eq(oauthClients.id, live.client));
  await sweepTokens();
  assert.deepEqual(await db.select().from(apiKeys).where(eq(apiKeys.clientId, t.client)), []);
  assert.deepEqual(await db.select().from(oauthClients).where(eq(oauthClients.id, abandoned.client_id)), []);
  // Long unused, but it still holds a key that renews: kept.
  assert.equal((await db.select().from(oauthClients).where(eq(oauthClients.id, live.client))).length, 1);
  assert.ok(await as(live.access_token));
});
