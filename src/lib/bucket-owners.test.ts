import assert from "node:assert/strict";
import { test } from "node:test";
import { ownerKey, strangers } from "./bucket-owners.ts";

const us = "11111111-1111-4111-8111-111111111111";
const them = "22222222-2222-4222-8222-222222222222";

test("a bucket only this database has marked is ours to sweep", () => {
  assert.deepEqual(strangers([], us), []);
  assert.deepEqual(strangers([ownerKey(us)], us), []);
});

test("another database's marker stops the sweep, and is named", () => {
  assert.deepEqual(strangers([ownerKey(us), ownerKey(them)], us), [them]);
  assert.deepEqual(strangers([ownerKey(them)], us), [them]);
});

test("the bare prefix is not a database", () => {
  assert.deepEqual(strangers(["sweep-owners/"], us), []);
});
