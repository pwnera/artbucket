import assert from "node:assert/strict";
import { test } from "node:test";
import { canFollow, followingUrl, withSignature } from "./asset-url.ts";

test("a following link is the same file at /c/", () => {
  assert.equal(followingUrl("/a/abc"), "/c/abc");
  assert.equal(followingUrl("/a/abc/w_800,f_webp"), "/c/abc/w_800,f_webp");
  assert.equal(followingUrl("/a/abc?download"), "/c/abc?download");
  assert.equal(followingUrl("/c/abc"), "/c/abc");
  assert.equal(followingUrl("/p/a/b"), "/p/a/b");
});

test("only an approved asset in use has a current version to follow", () => {
  assert.equal(canFollow({ state: "active" }), true);
  for (const state of ["draft", "proposed", "expired", "archived", "rejected", "deleted"]) assert.equal(canFollow({ state }), false);
});

test("a signature joins whatever query is there", () => {
  assert.equal(withSignature("/a/x", "1.s"), "/a/x?s=1.s");
  assert.equal(withSignature("/a/x?download", "1.s"), "/a/x?download&s=1.s");
});
