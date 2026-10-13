import assert from "node:assert/strict";
import { test } from "node:test";
import { assetAddresses, BUILD_KINDS, candidates, contentTypeOf, mountPath, readsLinks, servesBuild, siteFiles, unlockCookie } from "./sites.ts";

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

test("a site's own address serves its build where one is mounted, and the portal everywhere else", () => {
  const press = { kind: "portal", mounts: ["/docs"] };
  assert.equal(servesBuild(press, ""), false);
  assert.equal(servesBuild(press, "/logo"), false);
  assert.equal(servesBuild(press, "/docs"), true);
  assert.equal(servesBuild(press, "/docs/start"), true);
  assert.equal(servesBuild(press, "/docsy"), false);
  assert.equal(servesBuild({ kind: "docs", mounts: [] }, ""), true);
});

test("the door's cookie is host-only over HTTPS, so a sibling site can't set or shadow it", () => {
  assert.equal(unlockCookie(true), "__Host-ab_site");
  assert.equal(unlockCookie(false), "ab_site");
});

test("a build's text names the library by /a/ (pinned) and /c/ (current), on any host or none", () => {
  const a = "0b6c2f0e-6a52-4a5e-9d3b-1f1a2c3d4e5f";
  const c = "9f1e0d2c-3b4a-4c5d-8e6f-7a8b9c0d1e2f";
  const html = `<img src="https://app.example.com/a/${a}/w_800,f_webp"><img src="/c/${c.toUpperCase()}"><a href="/a/${a}">x</a> url(/media/${a})`;
  assert.deepEqual(assetAddresses(html), { pinned: [a], current: [c] });
  assert.deepEqual(assetAddresses(`/a/${a}0`), { pinned: [], current: [] });
  assert.ok(readsLinks("index.html", 10) && readsLinks("assets/app.mjs", 10) && readsLinks("style.CSS", 10));
  assert.ok(!readsLinks("logo.png", 10) && !readsLinks("bundle.js", 3_000_000));
});
