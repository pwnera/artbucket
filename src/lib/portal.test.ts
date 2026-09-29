import assert from "node:assert/strict";
import { test } from "node:test";
import { downloadsFor, hostname, PORTAL_SLUG, PortalSite, slugAtHost, subdomainRefusal } from "./portal.ts";
import { PortalPatch } from "./schemas.ts";

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

test("subdomains: one label under the portal domain, never a reserved name or a look-alike", () => {
  const d = "artbucket.page";
  assert.equal(slugAtHost("blender.artbucket.page", d), "blender");
  assert.equal(slugAtHost("press-kit.artbucket.page", d), "press-kit");
  for (const host of ["artbucket.page", "a.b.artbucket.page", "blender.artbucket.site", "blenderartbucket.page", "www.artbucket.page", "xn--pple-43d.artbucket.page", "-x.artbucket.page"]) {
    assert.equal(slugAtHost(host, d), null, host);
  }
  assert.equal(slugAtHost("blender.artbucket.page", undefined), null);
  assert.equal(subdomainRefusal("press"), null);
  assert.match(subdomainRefusal("api")!, /kept/);
  assert.match(subdomainRefusal("ab--c")!, /dashes/);
});

test("site: footer, quick grab, terms and listing; links go to the web, mail or a path, never a script", () => {
  const site = {
    footer: { text: "**Blender** guidelines", links: [{ label: "Press", href: "https://www.blender.org/press/" }], credit: "Blender Foundation", feedback: "mailto:brand@blender.org" },
    quick: [
      { label: "Logo", page: "logo" },
      { label: "Cycles colors", brand: "cycles", page: "color" },
      { label: "Kit", asset: "0b0e3c6a-5f6d-4c1e-9a53-7d1f6f2b8e01" },
      { label: "Store", href: "/p/press?view=assets" },
    ],
    terms: "Use the marks as they are.",
    listed: true,
  };
  assert.deepEqual(PortalSite.parse(site), site);
  assert.deepEqual(PortalSite.parse({}), {});
  for (const href of ["javascript:alert(1)", "data:text/html,x", "//evil.example", "ftp://x.example"]) {
    assert.ok(!PortalSite.safeParse({ footer: { links: [{ label: "x", href }] } }).success, href);
    assert.ok(!PortalSite.safeParse({ quick: [{ label: "x", href }] }).success, href);
    assert.ok(!PortalSite.safeParse({ footer: { feedback: href } }).success, href);
  }
  for (const q of [{ label: "None" }, { label: "Two", page: "logo", href: "https://x.example" }, { label: "Brand alone", brand: "cycles", asset: "0b0e3c6a-5f6d-4c1e-9a53-7d1f6f2b8e01" }]) {
    assert.ok(!PortalSite.safeParse({ quick: [q] }).success, q.label);
  }
  assert.ok(!PortalSite.safeParse({ quick: Array.from({ length: 7 }, (_, i) => ({ label: `L${i}`, page: "logo" })) }).success);
  assert.ok(!PortalSite.safeParse({ sitemap: true }).success);
});

test("a theme change keeps what it leaves out: the accent alone never clears the logo", () => {
  assert.deepEqual(PortalPatch.parse({ theme: { accent: "#00aa55" } }).theme, { accent: "#00aa55" });
  assert.deepEqual(PortalPatch.parse({ theme: { logo: null } }).theme, { logo: null });
});
