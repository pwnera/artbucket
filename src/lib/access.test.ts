import assert from "node:assert/strict";
import { test } from "node:test";
import { accessIn, assetScope, capAt, collectionScope, highest, isNarrowed, reach, widest } from "./access.ts";

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

test("private collections and assets are out of the workspace scope's reach", () => {
  const a = accessIn([g("workspace", "w1", "write"), g("collection", "secret2", "read")], ws, ["secret", "secret2"]);
  assert.equal(collectionScope(a, "secret"), null);
  assert.equal(collectionScope(a, "secret2"), "read", "a grant on it still reaches it");
  assert.equal(collectionScope(a, "open"), "write");
  assert.equal(assetScope(a, { id: "x", collections: ["secret"] }), null);
  assert.equal(assetScope(a, { id: "x", collections: ["secret", "open"] }), "write");
  assert.equal(assetScope(a, { id: "x", collections: [], private: true }), null);
  assert.equal(assetScope(accessIn([g("workspace", "w1", "admin")], ws, ["secret"]), { id: "x", collections: ["secret"] }), "admin");
});

test("reach lists what a scope reaches", () => {
  const a = accessIn([g("collection", "c1", "read"), g("collection", "c2", "write"), g("asset", "x", "propose")], ws);
  assert.deepEqual(reach(a, "read"), { collections: ["c1", "c2"], assets: ["x"], brands: [] });
  assert.deepEqual(reach(a, "write"), { collections: ["c2"], assets: [], brands: [] });
});

test("an agent's key is held to its grant and its person's access, whichever is lower", () => {
  const a = capAt(accessIn([g("workspace", "w1", "admin"), g("collection", "c1", "admin"), g("asset", "a1", "read")], ws), "propose");
  assert.equal(a.scope, "propose");
  assert.equal(collectionScope(a, "c1"), "propose");
  assert.equal(a.narrow.assets.a1, "read");
  assert.equal(capAt(accessIn([], ws), "write").scope, null);
});
