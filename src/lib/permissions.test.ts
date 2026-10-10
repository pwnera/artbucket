import assert from "node:assert/strict";
import { test } from "node:test";
import { ACTIONS, can, needs, type Who } from "./permissions.ts";

const none = { collections: {}, assets: {}, brands: {} };
const base = { hidden: [] as string[] };
const viewer: Who = { ...base, scope: "read", orgScope: null, narrow: none };
const editor: Who = { ...base, scope: "write", orgScope: null, narrow: none };
const orgAdmin: Who = { ...base, scope: "admin", orgScope: "admin", narrow: none };
const contractor: Who = { ...base, scope: null, orgScope: null, narrow: { collections: { c1: "write" }, assets: { a9: "propose" }, brands: {} } };

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

test("roles alone decide: an editor edits, approves, deletes and shares, a contributor only suggests", () => {
  for (const a of ["asset.edit", "asset.review", "asset.delete", "asset.share"] as const) assert.equal(can(editor, a, { id: "x" }), true, a);
  assert.equal(can(editor, "brand.delete"), true);
  const contributor: Who = { ...base, scope: "propose", orgScope: null, narrow: none };
  assert.equal(can(contributor, "asset.upload"), true);
  assert.equal(can(contributor, "asset.edit", { id: "x" }), false);
  assert.equal(can(contributor, "asset.delete", { id: "x" }), false);
});

test("private things turn the workspace scope away, except an admin's", () => {
  const withSecret = { ...base, hidden: ["secret"] };
  const ed: Who = { ...editor, ...withSecret };
  const admin: Who = { ...orgAdmin, ...withSecret };
  const member: Who = { ...viewer, ...withSecret, narrow: { collections: { secret: "read" }, assets: {}, brands: {} } };
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

test("a brand: the workspace's role, or a grant on it; a private one turns the workspace's away", () => {
  const brandEditor: Who = { ...base, scope: "read", orgScope: null, narrow: { ...none, brands: { kids: "write" } } };
  assert.equal(can(brandEditor, "brand.edit", { id: "kids" }), true, "a grant on the brand");
  assert.equal(can(brandEditor, "brand.edit", { id: "acme" }), false, "not another brand");
  assert.equal(can(brandEditor, "brand.read", { id: "acme" }), true, "reads the workspace's brands, as its viewer");
  const contractor_: Who = { ...base, scope: null, orgScope: null, narrow: { ...none, collections: { c1: "write" } } };
  assert.equal(can(contractor_, "brand.read", { id: "acme" }), false, "a collection grant reaches no brand");
  assert.equal(can(brandEditor, "brand.create"), false, "making brands is the workspace's");
  assert.equal(can(editor, "brand.read", { id: "draft", private: true }), false, "private: the workspace role turns away");
  assert.equal(can(orgAdmin, "brand.edit", { id: "draft", private: true }), true, "admins excepted");
  assert.equal(can({ ...viewer, narrow: { ...none, brands: { draft: "read" } } }, "brand.read", { id: "draft", private: true }), true, "a grant on it reaches it");
});
