import assert from "node:assert/strict";
import { test } from "node:test";
import { ACTIONS, can, needs, type Who } from "./permissions.ts";

const none = { collections: {}, assets: {} };
const viewer: Who = { scope: "read", orgScope: null, narrow: none };
const editor: Who = { scope: "write", orgScope: null, narrow: none };
const orgAdmin: Who = { scope: "admin", orgScope: "admin", narrow: none };
const contractor: Who = { scope: null, orgScope: null, narrow: { collections: { c1: "write" }, assets: { a9: "propose" } } };

test("workspace actions take the scope on the whole workspace", () => {
  assert.equal(can(viewer, "collection.create"), false);
  assert.equal(can(editor, "collection.create"), true);
  assert.equal(can(editor, "member.manage"), false);
  assert.equal(can(contractor, "brand.edit"), false, "a collection grant doesn't reach the workspace");
});

test("organization actions take the scope on the organization", () => {
  assert.equal(can(editor, "organization.manage"), false);
  assert.equal(can(orgAdmin, "organization.manage"), true);
});

test("collection and asset actions reach through grants, and without a target mean somewhere", () => {
  assert.equal(can(contractor, "asset.edit", { id: "x", collections: ["c1"] }), true);
  assert.equal(can(contractor, "asset.edit", { id: "x", collections: ["c2"] }), false);
  assert.equal(can(contractor, "asset.propose_tags", { id: "a9" }), true);
  assert.equal(can(contractor, "asset.edit", { id: "a9" }), false);
  assert.equal(can(contractor, "collection.share", { id: "c1" }), true);
  assert.equal(can(contractor, "asset.edit"), true, "somewhere: in c1");
  assert.equal(can(viewer, "asset.edit"), false);
  assert.equal(can(contractor, "workspace.upload"), false, "not into the workspace itself");
});

test("anywhere means any grant at all", () => {
  assert.equal(can(contractor, "library.read"), true);
  assert.equal(can({ scope: null, orgScope: null, narrow: none }, "library.read"), false);
});

test("every action reads as a sentence", () => {
  for (const a of Object.keys(ACTIONS) as (keyof typeof ACTIONS)[]) assert.match(needs(a), /^(read|propose|write|admin) (on|somewhere)/);
});
