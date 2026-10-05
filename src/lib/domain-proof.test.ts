import assert from "node:assert/strict";
import { test } from "node:test";
import { PROOF_GRACE_DAYS, reproof } from "./domain-proof.ts";

const day = 86_400_000;
const now = new Date("2026-10-05T00:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * day);

test("a record still there clears any absence", () => {
  assert.deepEqual(reproof(["other", "tok"], "tok", ago(6), now), { missingSince: null, unverify: false });
});

test("a record first found gone starts the count, and keeps the domain", () => {
  assert.deepEqual(reproof([], "tok", null, now), { missingSince: now, unverify: false });
  assert.deepEqual(reproof(["someone-else"], "tok", ago(3), now), { missingSince: ago(3), unverify: false });
});

test("gone at every look for the grace period unverifies it", () => {
  assert.equal(reproof([], "tok", ago(PROOF_GRACE_DAYS - 0.1), now).unverify, false);
  assert.equal(reproof([], "tok", ago(PROOF_GRACE_DAYS), now).unverify, true);
});

test("no answer from the resolver counts for nothing either way", () => {
  assert.deepEqual(reproof(null, "tok", null, now), { missingSince: null, unverify: false });
  assert.deepEqual(reproof(null, "tok", ago(30), now), { missingSince: ago(30), unverify: false });
});
