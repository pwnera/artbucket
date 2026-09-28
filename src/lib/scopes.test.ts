import assert from "node:assert/strict";
import { test } from "node:test";
import { allows, parseAnonymous, ROLES, roleName, SCOPES } from "./scopes.ts";

test("scopes are a ladder, and no scope allows nothing", () => {
  assert.ok(allows("admin", "read"));
  assert.ok(allows("write", "propose"));
  assert.ok(allows("propose", "propose"));
  assert.ok(!allows("propose", "write"));
  assert.ok(!allows("read", "propose"));
  assert.ok(!allows(null, "read"));
});

test("ANONYMOUS_SCOPE unset is left for the server to decide, takes none, rejects typos", () => {
  assert.equal(parseAnonymous(undefined), undefined);
  assert.equal(parseAnonymous(" "), undefined);
  assert.equal(parseAnonymous("none"), null);
  assert.equal(parseAnonymous("read"), "read");
  assert.throws(() => parseAnonymous("reader"));
});

test("every scope has one role name, in ladder order", () => {
  assert.deepEqual(ROLES.map((r) => r.scope), [...SCOPES]);
  assert.equal(roleName("propose"), "Contributor");
});
