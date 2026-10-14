import assert from "node:assert/strict";
import { test } from "node:test";
import { assetAddresses, BUILD_KINDS, candidates, contentTypeOf, mountPath, PREVIEW_NAME, previewLabel, readsLinks, servesBuild, siteFiles, storybookComponents, unlockCookie } from "./sites.ts";
import { previewAtHost } from "./portal.ts";

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

test("a preview's name is one an address can hold, and its host names the site and the preview", () => {
  for (const ok of ["pr-12", "a", "main", "feature-x-2"]) assert.ok(PREVIEW_NAME.test(ok), ok);
  for (const bad of ["PR-12", "pr--12", "-pr", "pr-", "pr_12", "x".repeat(31), ""]) assert.ok(!PREVIEW_NAME.test(bad), bad);
  assert.equal(previewLabel("acme", "pr-12"), "pr-12--acme");
  assert.equal(previewLabel("a".repeat(40), "b".repeat(30)), null);
  const name = (s: string) => PREVIEW_NAME.test(s);
  assert.deepEqual(previewAtHost("pr-12--acme.sites.test", "sites.test", name), { slug: "acme", preview: "pr-12" });
  // A site's own address, a dash or two inside its slug, another domain, a nested name: none is a preview.
  assert.equal(previewAtHost("acme.sites.test", "sites.test", name), null);
  assert.equal(previewAtHost("--acme.sites.test", "sites.test", name), null);
  assert.equal(previewAtHost("pr-12--acme.other.test", "sites.test", name), null);
  assert.equal(previewAtHost("x.pr-12--acme.sites.test", "sites.test", name), null);
  assert.equal(previewAtHost("pr-12--acme.sites.test", undefined, name), null);
});

test("a Storybook's index.json: one component per title, its stories in order, docs only when nothing else", () => {
  const index = {
    v: 5,
    entries: {
      "ui-button--docs": { type: "docs", id: "ui-button--docs", title: "UI/Button", name: "Docs" },
      "ui-button--primary": { type: "story", id: "ui-button--primary", title: "UI/Button", name: "Primary" },
      "ui-button--ghost": { type: "story", id: "ui-button--ghost", title: "UI/Button", name: "Ghost" },
      "intro--docs": { type: "docs", id: "intro--docs", title: "Intro", name: "Docs" },
      junk: { id: 4 },
    },
  };
  assert.deepEqual(storybookComponents(index), [
    { slug: "ui-button", name: "Button", title: "UI/Button", story: "ui-button--primary", stories: ["Primary", "Ghost"] },
    { slug: "intro", name: "Intro", title: "Intro", story: "intro--docs", stories: [] },
  ]);
  assert.deepEqual(storybookComponents({ v: 3, stories: { "a--b": { id: "a--b", title: "A", name: "B" } } }), [{ slug: "a", name: "A", title: "A", story: "a--b", stories: ["B"] }]);
  assert.deepEqual(storybookComponents(null), []);
  assert.deepEqual(storybookComponents("nope"), []);
});
