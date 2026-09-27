import assert from "node:assert/strict";
import { test } from "node:test";
import { hashPassword, refusal, shareToken, verifyPassword } from "./share.ts";

test("a password hash verifies its password and nothing else", async () => {
  const h = await hashPassword("correct horse");
  assert.match(h, /^scrypt\$/);
  assert.equal(await verifyPassword("correct horse", h), true);
  assert.equal(await verifyPassword("correct hors", h), false);
  assert.equal(await verifyPassword("correct horse", "garbage"), false);
  assert.notEqual(await hashPassword("correct horse"), h, "salted");
});

test("a link refuses when expired or when its password is missing or wrong", async () => {
  const now = new Date("2026-10-01T12:00:00Z");
  const open = { expiresAt: null, passwordHash: null };
  assert.equal(await refusal(open, undefined, now), null);
  assert.equal(await refusal({ ...open, expiresAt: new Date("2026-10-01T11:59:59Z") }, undefined, now), "gone");
  assert.equal(await refusal({ ...open, expiresAt: new Date("2026-10-02T00:00:00Z") }, undefined, now), null);
  const locked = { expiresAt: null, passwordHash: await hashPassword("s3cret") };
  assert.equal(await refusal(locked, undefined, now), "password");
  assert.equal(await refusal(locked, "nope", now), "password");
  assert.equal(await refusal(locked, "s3cret", now), null);
});

test("tokens are url-safe and don't repeat", () => {
  const a = shareToken();
  assert.match(a, /^[A-Za-z0-9_-]{24}$/);
  assert.notEqual(a, shareToken());
});
