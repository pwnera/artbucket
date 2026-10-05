import { test } from "node:test";
import assert from "node:assert/strict";
import { makeChallenge, POW_TTL, solve, verifySolution } from "./pow.ts";

const KEY = "a-secret-long-enough-for-the-test";
const edit = (payload: string, change: (s: Record<string, unknown>) => void) => {
  const s = JSON.parse(atob(payload));
  change(s);
  return btoa(JSON.stringify(s));
};

test("pow: a solved challenge holds once, then is a replay", async () => {
  const c = await makeChallenge(KEY, Date.now(), 2000);
  assert.equal(c.algorithm, "SHA-256");
  assert.match(c.salt, /^[0-9a-f]{24}\?expires=\d+$/);
  const s = (await solve(c))!;
  assert.ok(s);
  assert.equal(await verifySolution(KEY, s), null);
  assert.equal(await verifySolution(KEY, s), "replayed");
});

test("pow: expired, forged, tampered and wrong solutions are refused", async () => {
  const now = Date.now();
  const c = await makeChallenge(KEY, now, 2000);
  const s = (await solve(c))!;
  assert.equal(await verifySolution(KEY, s, now + POW_TTL + 1000), "expired");
  assert.equal(await verifySolution("another-key-another-key-another-key", s), "forged");
  // A later expiry in the salt: its hash no longer matches the signed challenge.
  assert.equal(await verifySolution(KEY, edit(s, (x) => (x.salt = String(x.salt).replace(/expires=\d+/, "expires=9999999999")))), "wrong");
  assert.equal(await verifySolution(KEY, edit(s, (x) => (x.number = Number(x.number) + 1))), "wrong");
  assert.equal(await verifySolution(KEY, edit(s, (x) => (x.challenge = "0".repeat(64)))), "forged");
  assert.equal(await verifySolution(KEY, edit(s, (x) => (x.signature = "nope"))), "forged");
  assert.equal(await verifySolution(KEY, edit(s, (x) => (x.algorithm = "SHA-1"))), "malformed");
  assert.equal(await verifySolution(KEY, "not base64 json"), "malformed");
  // Still good after all that: none of them used it up.
  assert.equal(await verifySolution(KEY, s), null);
});

test("pow: solving stops when aborted", async () => {
  const c = await makeChallenge(KEY);
  const ac = new AbortController();
  ac.abort();
  assert.equal(await solve(c, ac.signal), null);
});
