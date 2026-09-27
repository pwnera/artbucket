import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { normalizeCode, pkceMatches, redirectAllowed, userCode } from "./oauth.ts";

test("PKCE: the verifier's SHA-256 is the challenge, and a short verifier never matches", () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  assert.ok(pkceMatches(verifier, challenge));
  assert.ok(!pkceMatches(verifier, challenge.slice(1)));
  assert.ok(!pkceMatches("short", createHash("sha256").update("short").digest("base64url")));
});

test("redirects: https, loopback http, an app's scheme; never one a browser runs", () => {
  assert.ok(redirectAllowed("https://claude.ai/api/mcp/auth_callback"));
  assert.ok(redirectAllowed("http://127.0.0.1:33418/callback"));
  assert.ok(redirectAllowed("http://localhost:6274/oauth/callback"));
  assert.ok(redirectAllowed("cursor://anysphere.cursor-mcp/oauth/callback"));
  assert.ok(!redirectAllowed("http://evil.example/callback"));
  assert.ok(!redirectAllowed("javascript:alert(1)"));
  assert.ok(!redirectAllowed("data:text/html,hi"));
  assert.ok(!redirectAllowed("https://claude.ai/cb#frag"));
  assert.ok(!redirectAllowed("not a url"));
});

test("user codes read back however they are typed", () => {
  const c = userCode();
  assert.match(c, /^[B-Z]{4}-[B-Z]{4}$/);
  assert.equal(normalizeCode(c.toLowerCase().replace("-", " ")), c);
  assert.equal(normalizeCode("abc"), null);
});
