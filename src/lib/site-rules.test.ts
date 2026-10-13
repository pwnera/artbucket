import assert from "node:assert/strict";
import { test } from "node:test";
import { headersFor, matchPath, parseHeaders, parseRedirects, redirectFor } from "./site-rules.ts";

test("_redirects: paths, targets and statuses, 301 when left out, ! to apply over a file", () => {
  const { redirects, errors } = parseRedirects(`
# Sign-up lives in the app
/signup        https://app.example.com/signup   302
/blog/*        /news/:splat
/team/:name    /people/:name   308!
/app/*         /app/index.html 200
`);
  assert.deepEqual(errors, []);
  assert.deepEqual(redirects, [
    { from: "/signup", to: "https://app.example.com/signup", status: 302, force: false },
    { from: "/blog/*", to: "/news/:splat", status: 301, force: false },
    { from: "/team/:name", to: "/people/:name", status: 308, force: true },
    { from: "/app/*", to: "/app/index.html", status: 200, force: false },
  ]);
});

test("_redirects: what is wrong says which line", () => {
  const { errors } = parseRedirects(["/only-one", "blog /news", "/a /b 418", "/x https://e.com 200", "/q /r 301 Country=fr", "/a*b /c"].join("\n"));
  assert.deepEqual(errors, [
    "_redirects:1: a rule is a path, where it goes, and a status",
    "_redirects:2: blog isn't a path starting with /",
    "_redirects:3: status 418 isn't one of 200, 301, 302, 303, 307, 308, 404",
    "_redirects:4: a 200 serves a file of the build, so its target is a path",
    "_redirects:5: conditions (query, country, language, role) aren't supported",
    "_redirects:6: /a*b isn't * only at the end",
  ]);
});

test("a pattern matches a path, captures :names and the rest as splat", () => {
  assert.deepEqual(matchPath("/blog/*", "/blog/2026/hello"), { splat: "2026/hello" });
  assert.deepEqual(matchPath("/blog/*", "/blog/"), { splat: "" });
  assert.deepEqual(matchPath("/team/:name", "/team/ada/"), { name: "ada" });
  assert.equal(matchPath("/team/:name", "/team"), null);
  assert.equal(matchPath("/signup", "/signup/now"), null);
  assert.deepEqual(matchPath("/*", "/anything/at/all"), { splat: "anything/at/all" });
  const { redirects } = parseRedirects("/blog/* /news/:splat\n/team/:name https://x.example/:name 302");
  assert.deepEqual(redirectFor(redirects, "/blog/2026/hello"), { from: "/blog/*", to: "/news/2026/hello", status: 301, force: false });
  assert.equal(redirectFor(redirects, "/team/ada")?.to, "https://x.example/ada");
  assert.equal(redirectFor(redirects, "/elsewhere"), null);
});

test("_headers: blocks of a path and its headers, merged for a path in file order; cookies are the server's", () => {
  const { headers, errors } = parseHeaders(`
/*
  Content-Security-Policy: default-src 'self'
  X-Frame-Options: DENY
/assets/*
  Cache-Control: public, max-age=31536000, immutable
`);
  assert.deepEqual(errors, []);
  assert.deepEqual(headersFor(headers, "/assets/app.js"), [
    ["Content-Security-Policy", "default-src 'self'"],
    ["X-Frame-Options", "DENY"],
    ["Cache-Control", "public, max-age=31536000, immutable"],
  ]);
  assert.equal(headersFor(headers, "/index.html").length, 2);
  assert.deepEqual(parseHeaders("  X-Orphan: 1\n/*\n  Set-Cookie: a=b\n  not a header\n/x\n  Bad Name: 1").errors, [
    "_headers:1: a header comes after the path it is for",
    "_headers:3: Set-Cookie is the server's to set",
    "_headers:4: a header is Name: value",
    "_headers:6: a header is Name: value",
  ]);
});
