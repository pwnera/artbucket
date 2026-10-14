import assert from "node:assert/strict";
import { test } from "node:test";
import { assetLink, canFollow, followingUrl, splitLink, withName, withSignature } from "./asset-url.ts";

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

const hero = { id: "abc", filename: "IMG_2034.JPG", mime: "image/jpeg", metadata: { title: "Summer hero" } };

test("a link carries the asset's name, with the extension of what it serves", () => {
  assert.equal(assetLink(hero), "/a/abc/summer-hero.jpg");
  assert.equal(assetLink(hero, "/w_800,f_webp"), "/a/abc/w_800,f_webp/summer-hero.webp");
  assert.equal(assetLink(hero, "/w_800,f_jpeg"), "/a/abc/w_800,f_jpeg/summer-hero.jpg");
  assert.equal(assetLink(hero, "?download"), "/a/abc/summer-hero.jpg?download");
  assert.equal(assetLink(hero, "/f_png?download"), "/a/abc/f_png/summer-hero.png?download");
  // No format asked: the file's own, or a PNG of a derived still.
  assert.equal(assetLink({ ...hero, mime: "image/png", filename: "a.png" }, "/w_800"), "/a/abc/w_800/summer-hero.png");
  assert.equal(assetLink({ ...hero, mime: "application/pdf", filename: "deck.pdf", probe: { preview: "x" } }, "/w_800"), "/a/abc/w_800/summer-hero.png");
  assert.equal(assetLink({ ...hero, mime: "image/heic", filename: "a.heic" }, "/w_800"), "/a/abc/w_800/summer-hero.jpg");
  // Untitled: the file name. Unnameable or without an extension: no name, the link as before.
  assert.equal(assetLink({ ...hero, metadata: null }), "/a/abc/img-2034.jpg");
  assert.equal(assetLink({ ...hero, metadata: { title: "夏" } }, "/w_800,f_webp"), "/a/abc/w_800,f_webp");
  assert.equal(assetLink({ ...hero, filename: "README", metadata: null }), "/a/abc");
  // A transform that doesn't parse is left as it is, for the server to refuse.
  assert.equal(withName(hero, "/w_x"), "/w_x");
});

test("a link that names nothing is the link that was", () => {
  assert.deepEqual(splitLink(), { spec: null });
  assert.deepEqual(splitLink([]), { spec: null });
  assert.deepEqual(splitLink(["w_800,f_webp"]), { spec: "w_800,f_webp" });
});

test("a name is read by nobody, and never taken for a transform", () => {
  assert.deepEqual(splitLink(["summer-hero.jpg"]), { spec: null });
  assert.deepEqual(splitLink(["summer_hero.png"]), { spec: null });
  assert.deepEqual(splitLink(["w_800,f_webp", "summer-hero.webp"]), { spec: "w_800,f_webp" });
  // Whatever extension it ends in: the transform says what is served.
  assert.deepEqual(splitLink(["w_800,f_webp", "summer-hero.png"]), { spec: "w_800,f_webp" });
  // A malformed transform is still one, for a 400, not the original served in its place.
  assert.deepEqual(splitLink(["w800"]), { spec: "w800" });
  // A rendition added after a named link's name is the same rendition.
  assert.deepEqual(splitLink(["summer-hero.jpg", "w_800,f_webp"]), { spec: "w_800,f_webp" });
  for (const bad of [["w_800", "w_400"], ["w_800", "a", "b.jpg"], ["a.jpg", "b.jpg"]]) assert.equal(splitLink(bad), null);
});

test("a following link keeps the name", () => {
  assert.equal(followingUrl(assetLink(hero, "/w_800,f_webp")), "/c/abc/w_800,f_webp/summer-hero.webp");
});
