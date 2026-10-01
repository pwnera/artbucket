import assert from "node:assert/strict";
import { test } from "node:test";
import { NO_OFF } from "./access.ts";
import { ACTIONS, can, needs, type Who } from "./permissions.ts";

const none = { collections: {}, assets: {} };
const base = { off: NO_OFF, hidden: [] as string[] };
const viewer: Who = { ...base, scope: "read", orgScope: null, narrow: none };
const editor: Who = { ...base, scope: "write", orgScope: null, narrow: none };
const orgAdmin: Who = { ...base, scope: "admin", orgScope: "admin", narrow: none };
const contractor: Who = { ...base, scope: null, orgScope: null, narrow: { collections: { c1: "write" }, assets: { a9: "propose" } } };

test("workspace actions take the scope on the whole workspace", () => {
  assert.equal(can(viewer, "collection.create"), false);
  assert.equal(can(editor, "collection.create"), true);
  assert.equal(can(editor, "member.manage"), false);
  assert.equal(can(contractor, "brand.edit"), false, "a collection grant doesn't reach the workspace");
  assert.equal(can(viewer, "brand.comment"), false, "reading the guidelines isn't reviewing them");
  assert.equal(can({ ...viewer, scope: "propose" }, "brand.comment"), true);
  assert.equal(can(contractor, "brand.comment"), false);
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
  assert.equal(can({ ...base, scope: null, orgScope: null, narrow: none }, "library.read"), false);
});

test("an ability switched off keeps its actions from a scope that would allow them", () => {
  const noDelete: Who = { ...editor, off: { ...NO_OFF, workspace: ["delete", "share"] } };
  assert.equal(can(noDelete, "asset.edit", { id: "x" }), true);
  assert.equal(can(noDelete, "asset.delete", { id: "x" }), false);
  assert.equal(can(noDelete, "collection.delete"), false);
  assert.equal(can(noDelete, "brand.edit"), true);
  assert.equal(can(noDelete, "brand.delete"), false, "editing a brand isn't deleting it");
  assert.equal(can(editor, "brand.delete"), true);
  assert.equal(can(noDelete, "asset.share", { id: "x" }), false);
  assert.equal(can(noDelete, "share.manage"), false, "nowhere: the only level has share off");
  // A collection grant with share on gives it back there, and only there.
  const there: Who = { ...noDelete, narrow: { collections: { c1: "write" }, assets: {} } };
  assert.equal(can(there, "asset.share", { id: "x", collections: ["c1"] }), true);
  assert.equal(can(there, "asset.share", { id: "y", collections: [] }), false);
});

test("private things turn the workspace scope away, except an admin's", () => {
  const withSecret = { ...base, hidden: ["secret"] };
  const ed: Who = { ...editor, ...withSecret };
  const admin: Who = { ...orgAdmin, ...withSecret };
  const member: Who = { ...viewer, ...withSecret, narrow: { collections: { secret: "read" }, assets: {} } };
  assert.equal(can(ed, "collection.read", { id: "secret" }), false);
  assert.equal(can(ed, "asset.read", { id: "x", collections: ["secret"] }), false, "only in private collections: private");
  assert.equal(can(ed, "asset.edit", { id: "x", collections: ["secret", "open"] }), true, "also in an open one: not");
  assert.equal(can(ed, "asset.read", { id: "x", collections: [], private: true }), false);
  assert.equal(can(admin, "collection.edit", { id: "secret" }), true);
  assert.equal(can(member, "asset.read", { id: "x", collections: ["secret"] }), true);
  assert.equal(can(member, "asset.edit", { id: "x", collections: ["secret"] }), false);
});

test("every action reads as a sentence", () => {
  for (const a of Object.keys(ACTIONS) as (keyof typeof ACTIONS)[]) assert.match(needs(a), /^(read|propose|write|admin) (on|somewhere)/);
});
