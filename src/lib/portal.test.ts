import assert from "node:assert/strict";
import { test } from "node:test";
import { downloadsFor, hostname, PORTAL_SLUG } from "./portal.ts";

const base = "https://assets.example.com";

test("an image gets the portal's presets, named for what they are", () => {
  const d = downloadsFor({ id: "x", filename: "Logo v2.png", mime: "image/png" }, ["web", "png"], base);
  assert.deepEqual(
    d.map((x) => [x.preset, x.url, x.filename]),
    [
      ["web", `${base}/a/x/w_1920,q_85,f_jpeg`, "Logo v2-web.jpg"],
      ["png", `${base}/a/x/f_png`, "Logo v2-png.png"],
    ],
  );
});

test("the original only when the portal offers it, and always for what isn't an image", () => {
  assert.equal(downloadsFor({ id: "x", filename: "a.jpg", mime: "image/jpeg" }, ["original"], base)[0].url, `${base}/a/x?download`);
  const pdf = downloadsFor({ id: "y", filename: "kit.pdf", mime: "application/pdf" }, ["web", "print"], base);
  assert.deepEqual(pdf.map((x) => x.preset), ["original"]);
  // No presets at all still leaves something to download.
  assert.deepEqual(downloadsFor({ id: "x", filename: "a.jpg", mime: "image/jpeg" }, [], base).map((x) => x.preset), ["original"]);
});

test("host names: lowercased and bare, or refused", () => {
  assert.equal(hostname(" Brand.Example.COM. "), "brand.example.com");
  assert.equal(hostname("press.example.com:443"), "press.example.com");
  for (const bad of ["localhost", "http://x.com", "a..b.com", "-a.com", "x.c", "a b.com", `${"a".repeat(64)}.com`]) {
    assert.equal(hostname(bad), null, bad);
  }
});

test("slugs", () => {
  for (const ok of ["press", "partner-hub", "a", "2027"]) assert.ok(PORTAL_SLUG.test(ok), ok);
  for (const bad of ["-press", "press-", "Press", "a_b", ""]) assert.ok(!PORTAL_SLUG.test(bad), bad);
});
