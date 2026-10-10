import assert from "node:assert/strict";
import { test } from "node:test";
import { BUILD_KINDS, mountPath } from "./sites.ts";

test("a mount path is / or lowercase segments, no trailing slash", () => {
  assert.equal(mountPath("/"), "/");
  assert.equal(mountPath(""), "/");
  assert.equal(mountPath("/docs/"), "/docs");
  assert.equal(mountPath("/storybook/v2"), "/storybook/v2");
  for (const bad of ["docs", "/Docs", "/../x", "/a b", "/-x", "/a/b/c/d/e"]) assert.equal(mountPath(bad), null, bad);
});

test("every kind but the managed portal is a build", () => {
  assert.deepEqual(BUILD_KINDS, ["guidelines", "landing", "docs", "storybook"]);
});
