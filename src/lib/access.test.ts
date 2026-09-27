import assert from "node:assert/strict";
import { test } from "node:test";
import { accessIn, assetScope, collectionScope, highest, isNarrowed, reach, widest } from "./access.ts";

const ws = { id: "w1", organizationId: "o1" };
const g = (resource: "organization" | "workspace" | "collection" | "asset", resourceId: string, scope: "read" | "propose" | "write" | "admin", workspaceId: string | null = "w1") => ({
  resource,
  resourceId,
  workspaceId: resource === "organization" ? null : workspaceId,
  scope,
});

test("highest picks the top of the ladder and ignores gaps", () => {
  assert.equal(highest(), null);
  assert.equal(highest(null, undefined), null);
  assert.equal(highest("read", "write", "propose"), "write");
});

test("the organization's grant and the workspace's add up to the workspace scope", () => {
  assert.equal(accessIn([g("organization", "o1", "read"), g("workspace", "w1", "write")], ws).scope, "write");
  assert.equal(accessIn([g("organization", "o1", "admin"), g("workspace", "w1", "read")], ws).scope, "admin");
  // Another organization's or workspace's grants count for nothing here.
  assert.equal(accessIn([g("organization", "o2", "admin"), g("workspace", "w2", "admin", "w2")], ws).scope, null);
});

test("a collection grant reaches its assets, and only here", () => {
  const a = accessIn([g("collection", "c1", "write"), g("collection", "c9", "admin", "w2")], ws);
  assert.equal(a.scope, null);
  assert.ok(isNarrowed(a));
  assert.equal(collectionScope(a, "c1"), "write");
  assert.equal(collectionScope(a, "c9"), null, "a grant in another workspace doesn't apply");
  assert.equal(assetScope(a, { id: "x", collections: ["c2", "c1"] }), "write");
  assert.equal(assetScope(a, { id: "x", collections: ["c2"] }), null);
  assert.equal(widest(a), "write");
});

test("an asset grant raises that asset over the workspace scope", () => {
  const a = accessIn([g("workspace", "w1", "read"), g("asset", "x", "write")], ws);
  assert.equal(assetScope(a, { id: "x", collections: [] }), "write");
  assert.equal(assetScope(a, { id: "y", collections: [] }), "read");
  assert.equal(isNarrowed(a), false);
});

test("reach lists what a scope reaches", () => {
  const a = accessIn([g("collection", "c1", "read"), g("collection", "c2", "write"), g("asset", "x", "propose")], ws);
  assert.deepEqual(reach(a, "read"), { collections: ["c1", "c2"], assets: ["x"] });
  assert.deepEqual(reach(a, "write"), { collections: ["c2"], assets: [] });
});
