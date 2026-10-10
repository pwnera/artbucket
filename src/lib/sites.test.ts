import assert from "node:assert/strict";
import { test } from "node:test";
import { BUILD_KINDS, candidates, contentTypeOf, mountPath, siteFiles } from "./sites.ts";

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

test("a zip's files: its one wrapping folder off, hidden files dropped, nothing outside the site", () => {
  assert.deepEqual([...siteFiles(["dist/", "dist/index.html", "dist/a/b.css", "dist/.DS_Store"])!.keys()], ["index.html", "a/b.css"]);
  assert.deepEqual([...siteFiles(["index.html", "docs/x.html"])!.keys()], ["index.html", "docs/x.html"]);
  assert.equal(siteFiles(["../etc/passwd"]), null);
  assert.equal(siteFiles(["/abs.html"]), null);
});

test("a request finds its file, its index, its .html, then the 404 page", () => {
  assert.deepEqual(candidates("/"), ["index.html", "404.html"]);
  assert.deepEqual(candidates("/guides/"), ["guides/index.html", "404.html"]);
  assert.deepEqual(candidates("/app.js"), ["app.js", "404.html"]);
  assert.deepEqual(candidates("/guides/start"), ["guides/start", "guides/start.html", "guides/start/index.html", "404.html"]);
  assert.equal(contentTypeOf("a/b.CSS"), "text/css; charset=utf-8");
  assert.equal(contentTypeOf("run.exe"), "application/octet-stream");
});
