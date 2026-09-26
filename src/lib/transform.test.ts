import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_DIMENSION, parseTransform, serializeTransform } from "./transform.ts";

test("parses a simple transform", () => {
  assert.deepEqual(parseTransform("w_800,f_webp"), { w: 800, f: "webp" });
});

test("parses every supported key", () => {
  assert.deepEqual(parseTransform("w_1200,h_630,fit_cover,q_82,f_jpeg"), {
    w: 1200,
    h: 630,
    fit: "cover",
    q: 82,
    f: "jpeg",
  });
});

test("canonical form is order-independent", () => {
  const a = serializeTransform(parseTransform("f_webp,w_800")!);
  const b = serializeTransform(parseTransform("w_800,f_webp")!);
  assert.equal(a, b);
  assert.equal(a, "w_800,f_webp");
});

test("rejects malformed input", () => {
  for (const bad of [
    "",
    "w_",
    "_800",
    "w800",
    "zzz_1",
    "w_800,w_900", // duplicate key
    "f_gif", // unsupported format
    "fit_squish", // unsupported fit
    "q_0",
    "q_101",
    "w_0",
    "w_-1",
    "w_1.5",
    `w_${MAX_DIMENSION + 1}`,
    "w_" + "9".repeat(40), // overflow attempt
    "w_800,".repeat(40), // length cap
  ]) {
    assert.equal(parseTransform(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test("caps dimensions at the boundary, inclusive", () => {
  assert.deepEqual(parseTransform(`w_${MAX_DIMENSION}`), { w: MAX_DIMENSION });
});
