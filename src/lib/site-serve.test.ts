import assert from "node:assert/strict";
import { test } from "node:test";
import { mountFor, resolveSitePath, siteHeaders, type Mount } from "./site-serve.ts";

/**
 * Serving a build from its stored files (lib/site-serve.ts): the same answer
 * whether the server serves it or an edge in front does.
 */

const files = new Set(["d1/index.html", "d1/guide/index.html", "d1/404.html", "d1/app.js", "d1/_redirects", "d2/index.html"]);
const exists = async (key: string) => files.has(key);
const root: Mount = {
  path: "/",
  prefix: "d1/",
  rules: {
    redirects: [
      { from: "/old", to: "/guide/", status: 301, force: false },
      { from: "/spa/*", to: "/index.html", status: 200, force: false },
      { from: "/app.js", to: "/elsewhere.js", status: 302, force: false },
    ],
    headers: [{ path: "/*", headers: [["X-Frame-Options", "DENY"]] }],
  },
};
const docs: Mount = { path: "/docs", prefix: "d2/", rules: null };

test("the longest mount that holds a path", () => {
  assert.equal(mountFor([root, docs], "/docs/x")?.path, "/docs");
  assert.equal(mountFor([root, docs], "/docsy")?.path, "/");
  assert.equal(mountFor([docs], "/elsewhere"), null);
});

test("a file, a folder's slash, a redirect, a rewrite, the build's 404, its rules files never", async () => {
  assert.deepEqual(await resolveSitePath([root], "/", true, exists), { key: "d1/index.html", contentType: "text/html; charset=utf-8", status: 200, open: true, headers: [["X-Frame-Options", "DENY"]] });
  assert.deepEqual(await resolveSitePath([root], "/guide", true, exists), { slash: true });
  assert.equal(((await resolveSitePath([root], "/guide/", true, exists)) as { key: string }).key, "d1/guide/index.html");
  assert.deepEqual(await resolveSitePath([root], "/old", true, exists), { redirect: "/guide/", status: 301, headers: [["X-Frame-Options", "DENY"]] });
  // A file wins over a redirect that isn't forced.
  assert.equal(((await resolveSitePath([root], "/app.js", true, exists)) as { key: string }).key, "d1/app.js");
  assert.deepEqual(await resolveSitePath([root], "/spa/deep/link", false, exists), { key: "d1/index.html", contentType: "text/html; charset=utf-8", status: 200, open: false, headers: [["X-Frame-Options", "DENY"]] });
  assert.equal(((await resolveSitePath([root], "/nope", true, exists)) as { status: number }).status, 404);
  assert.equal(((await resolveSitePath([root], "/_redirects", true, exists)) as { key: string }).key, "d1/404.html");
  assert.deepEqual(await resolveSitePath([root, docs], "/docs", true, exists), { slash: true });
  assert.equal(await resolveSitePath([docs], "/docs/missing", true, exists), null, "no 404.html: nothing");
});

test("the headers a build's answer carries: the server's, then its own, a door never cacheable, a preview never indexed", () => {
  const open = siteHeaders([["Cache-Control", "public, max-age=3600"], ["Content-Security-Policy", "default-src 'self'"], ["X-Content-Type-Options", "off"]], true);
  assert.equal(open.get("Cache-Control"), "public, max-age=3600");
  assert.equal(open.get("Content-Security-Policy"), "frame-ancestors 'self', default-src 'self'");
  assert.equal(open.get("X-Content-Type-Options"), "nosniff");
  const door = siteHeaders([["Cache-Control", "public, max-age=3600"]], false, "pr-3");
  assert.equal(door.get("Cache-Control"), "private, no-store");
  assert.equal(door.get("X-Robots-Tag"), "noindex");
});
