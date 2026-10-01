import assert from "node:assert/strict";
import { test } from "node:test";
import { brandDomain, brandLook, downloadsFor, hostname, PORTAL_SLUG, portalRedirect, PortalSite, slugAtHost, subdomainRefusal, underDomain, wornTheme } from "./portal.ts";
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
  // A brand's domain: from a URL or a host, without www.
  for (const raw of ["https://www.Acme.com/about?x=1", "acme.com", "WWW.ACME.COM.", "http://user@acme.com:8080/#top"]) assert.equal(brandDomain(raw), "acme.com", raw);
  assert.equal(brandDomain("shop.acme.com"), "shop.acme.com");
  assert.equal(brandDomain("mailto:"), null);
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
  for (const host of ["artbucket.page", "nope.artbucket.page", "a.b.artbucket.page:3000", "WWW.Artbucket.page."]) assert.ok(underDomain(host, d), host);
  for (const host of ["app.artbucket.io", "notartbucket.page", "artbucket.page.evil.com"]) assert.ok(!underDomain(host, d), host);
  assert.ok(!underDomain("x.artbucket.page", undefined));
});

test("a portal asked for anywhere but its home goes there; members stay at /p/", () => {
  const sub = { url: "https://press.artbucket.page", slug: "press", access: "public" };
  // /p/ on the app's: to the subdomain, an old slug too.
  assert.equal(portalRedirect(sub, { slug: "press" }), "https://press.artbucket.page");
  assert.equal(portalRedirect(sub, { slug: "old" }), "https://press.artbucket.page");
  // At home: served. An old subdomain: home.
  assert.equal(portalRedirect(sub, { host: "press.artbucket.page", slug: "press" }), null);
  assert.equal(portalRedirect(sub, { host: "old.artbucket.page", slug: "old" }), "https://press.artbucket.page");
  // A domain of its own is home, the subdomain goes there.
  const own = { url: "https://press.example.com", slug: "press", access: "public" };
  assert.equal(portalRedirect(own, { host: "press.artbucket.page", slug: "press" }), "https://press.example.com");
  assert.equal(portalRedirect(own, { host: "press.example.com", slug: "press" }), null);
  // Members: /p/ on the app's; only an old slug moves, and a subdomain sends them there.
  const members = { url: "https://app.artbucket.io/p/team", slug: "team", access: "members" };
  assert.equal(portalRedirect(members, { slug: "team" }), null);
  assert.equal(portalRedirect(members, { slug: "crew" }), "/p/team");
  assert.equal(portalRedirect(members, { host: "team.artbucket.page", slug: "team" }), "https://app.artbucket.io/p/team");
  // A members portal on a domain of its own still answers at /p/ for sign-in.
  assert.equal(portalRedirect({ ...own, access: "members" }, { slug: "press" }), null);
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

test("a portal made for a brand wears its mark and color, unless it sets its own", () => {
  const rules = [
    { key: "color.secondary", type: "color" as const, value: "#222222", context: null, assets: [] },
    { key: "color.primary", type: "color" as const, value: "#e87d0d", context: null, assets: [] },
    { key: "logo.primary", type: "text" as const, value: "", context: null, assets: [{ id: "full", mime: "image/svg+xml" }] },
    { key: "logo.mark", type: "text" as const, value: "", context: null, assets: [{ id: "guide", mime: "application/pdf" }, { id: "mark", mime: "image/png" }] },
    { key: "logo.mark", type: "text" as const, value: "", context: "print", assets: [{ id: "print", mime: "image/png" }] },
  ];
  const look = brandLook(rules);
  assert.deepEqual(look, { logo: "mark", accent: "#e87d0d" });
  assert.deepEqual(brandLook([]), { logo: null, accent: null }, "a brand with nothing to lend");
  assert.deepEqual(wornTheme({ logo: null, accent: null }, look), look, "empty: the brand's");
  assert.deepEqual(wornTheme({ logo: "own", accent: "#000000" }, look), { logo: "own", accent: "#000000" }, "set: its own, for white-label");
  assert.deepEqual(wornTheme({ logo: null, accent: "#000000" }, look), { logo: "mark", accent: "#000000" }, "each on its own");
  assert.deepEqual(wornTheme({ logo: null, accent: null }, null), { logo: null, accent: null }, "no brand: the organization's");
});
