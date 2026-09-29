import assert from "node:assert/strict";
import { test } from "node:test";
import { followPath } from "./follow.ts";

const to = "2b1e6f0a-3c4d-4e5f-8a9b-0c1d2e3f4a5b";

test("keeps the rendition and swaps the id", () => {
  assert.equal(followPath("http://x/c/old", to), `/a/${to}`);
  assert.equal(followPath("http://x/c/old/w_800,f_webp", to), `/a/${to}/w_800,f_webp`);
  assert.equal(followPath("http://x/c/old/h_64%2Cf_png", to), `/a/${to}/h_64%2Cf_png`);
});

test("carries ?download, drops a signature made for another id", () => {
  assert.equal(followPath("http://x/c/old?download", to), `/a/${to}?download`);
  assert.equal(followPath("http://x/c/old/w_800?s=123.abc&x=1", to), `/a/${to}/w_800`);
});

test("stays on this origin whatever follows the id", () => {
  assert.ok(followPath("http://x/c/old//evil.example/x", to).startsWith(`/a/${to}/`));
});
