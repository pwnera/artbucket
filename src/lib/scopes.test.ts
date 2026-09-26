import assert from "node:assert/strict";
import { test } from "node:test";
import { allows, parseAnonymous } from "./scopes.ts";

test("scopes are a ladder, and no scope allows nothing", () => {
  assert.ok(allows("admin", "read"));
  assert.ok(allows("write", "propose"));
  assert.ok(allows("propose", "propose"));
  assert.ok(!allows("propose", "write"));
  assert.ok(!allows("read", "propose"));
  assert.ok(!allows(null, "read"));
});

test("ANONYMOUS_SCOPE defaults to admin, takes none, rejects typos", () => {
  assert.equal(parseAnonymous(undefined), "admin");
  assert.equal(parseAnonymous("none"), null);
  assert.equal(parseAnonymous("read"), "read");
  assert.throws(() => parseAnonymous("reader"));
});
