import assert from "node:assert/strict";
import test from "node:test";
import { claimProof, provesDomain } from "./domain-proof.ts";
import { backgroundOf, brandText, cookieDomain, domainsAbove, headingFace, hubHome, hubPath, logoOf, paletteOf, parseRef, swatches, withoutDomain, expireHostOnly } from "./hub.ts";

test("parseRef reads a brand and a pinned version, and nothing else", () => {
  assert.deepEqual(parseRef("rust"), { slug: "rust" });
  assert.deepEqual(parseRef("rust-lang@12"), { slug: "rust-lang", version: 12 });
  assert.deepEqual(parseRef("rust%4012"), { slug: "rust", version: 12 });
  for (const bad of ["", "Rust", "rust@0", "rust@", "rust@1.2", "-rust", "rust@x", "../x", "%", "rust%E0"]) assert.equal(parseRef(bad), null, bad);
  assert.equal(hubPath("rust-lang", "rust"), "/rust-lang/rust");
  assert.equal(hubPath("rust-lang", "rust", 3), "/rust-lang/rust@3");
});

const asset = (id: string, mime: string) => ({ id, mime, rendition: null, filename: null, title: null });
const rule = (key: string, type: "color" | "text" | "list" | "font", value: unknown, extra: object = {}) =>
  ({ key, label: null, context: null, type, value, usage: null, assets: [], ...extra }) as Parameters<typeof brandText>[1][number];

test("a card's colors and logo: defaults only, a logo rule's image before any other", () => {
  const rules = [
    rule("color.primary", "color", "#2a3439"),
    rule("color.dark", "color", "#000000", { context: "dark" }),
    rule("imagery.hero", "text", "x", { assets: [asset("a", "image/png")] }),
    rule("logo.primary", "text", "x", { assets: [asset("f", "font/woff2"), asset("b", "image/svg+xml")] }),
  ];
  assert.deepEqual(swatches(rules), ["#2a3439"]);
  assert.equal(logoOf(rules)?.id, "b");
  assert.equal(logoOf(rules.slice(0, 3))?.id, "a");
  assert.equal(logoOf([]), null);
});

test("a card's ground and palette: color.background, and up to six named colors", () => {
  const colors = ["primary", "secondary", "accent", "ink", "muted", "line", "extra"].map((k, i) => rule(`color.${k}`, "color", `#00000${i}`));
  assert.equal(backgroundOf(colors), null);
  assert.equal(backgroundOf([...colors, rule("color.background", "color", "#1c1e22")]), "#1c1e22");
  assert.equal(backgroundOf([rule("color.background", "color", "#000", { context: "dark" })]), null);
  const band = paletteOf([rule("color.primary", "color", "#e87d0d", { label: "Blender Orange" }), ...colors]);
  assert.equal(band.length, 6);
  assert.deepEqual(band[0], { hex: "#e87d0d", name: "Blender Orange" });
  assert.equal(band[1].name, "Primary");
});

test("a card's face: the heading's own file, else Google Fonts for its glyphs, else only named", () => {
  const url = (a: { id: string }) => `/a/${a.id}`;
  const font = (key: string, family: string, extra: object = {}) => rule(key, "font", { family, weight: 700 }, extra);
  const file = (id: string, filename: string) => ({ ...asset(id, "font/woff2"), filename });
  // The heading, not the first; its upright file.
  const own = headingFace([font("type.body", "Inter"), font("type.heading", "Metropolis", { assets: [file("i", "M-BoldItalic.woff2"), file("b", "M-Bold.woff2")] })], "Firefox", url);
  assert.deepEqual(own, { family: "Metropolis", weight: 700, css: null, src: "/a/b", named: null });
  // A role marks it too; Google Fonts asks only for the name's letters.
  const google = headingFace([font("type.a", "Fira Sans"), font("type.b", "Alfa Slab One", { spec: { role: "display", source: "google" } })], "Rust & co", url);
  assert.equal(google?.src, null);
  assert.equal(google?.css, "https://fonts.googleapis.com/css2?family=Alfa+Slab+One:wght@700&text=Rust%20%26%20co&display=swap");
  // Only italic files, or neither a file nor from Google: named, not loaded.
  assert.equal(headingFace([font("type.heading", "Inter", { assets: [file("i", "Inter-BoldItalic.ttf")] })], "X", url)?.src, null);
  assert.deepEqual(headingFace([font("type.heading", "Söhne")], "X", url), { family: "Söhne", weight: 700, css: null, src: null, named: null });
  // A foundry's face with a free look-alike for fallback: drawn in that, and said so.
  const stand = headingFace([font("type.heading", "Mark For MC Lt", { spec: { fallback: "Outfit, sans-serif" } })], "Mastercard", url);
  assert.deepEqual(stand, {
    family: "Outfit",
    weight: 700,
    css: "https://fonts.googleapis.com/css2?family=Outfit:wght@700&text=Mastercard&display=swap",
    src: null,
    named: "Mark For MC Lt",
  });
  // A fallback naming the family itself loads it as itself; a generic one stands in for nothing.
  assert.equal(headingFace([font("type.heading", "DM Sans", { spec: { fallback: "DM Sans" } })], "X", url)?.named, null);
  assert.equal(headingFace([font("type.heading", "DM Sans", { spec: { fallback: "DM Sans" } })], "X", url)?.css?.includes("family=DM+Sans"), true);
  assert.equal(headingFace([font("type.heading", "Söhne", { spec: { fallback: "sans-serif" } })], "X", url)?.css, null);
  assert.equal(headingFace([rule("color.primary", "color", "#000")], "X", url), null);
});

test("brandText says who listed it, and every rule with its files", () => {
  const about = { name: "Rust", owner: "Community", verified: null, version: 3, url: "https://hub/x/rust", guidelines: "https://p/rust", terms: "Ask first." };
  const text = brandText(about, [rule("color.primary", "color", "#2a3439", { usage: "Headers" }), rule("logo.always", "list", ["Say so"], { assets: [asset("b", "image/png")] }), rule("type.body", "font", { family: "Fira Sans", weight: 400 }), rule("color.bg", "color", "#000", { context: "dark" })], (a) => `https://f/${a.id}`);
  assert.match(text, /^# Rust\n/);
  assert.match(text, /community listing, not verified/);
  assert.match(text, /## Terms of use\n\nAsk first\./);
  assert.match(text, /### Always \(`logo.always`, list\)\n\n- Say so\n\nFiles:\n- image\/png: https:\/\/f\/b/);
  assert.match(text, /Fira Sans, 400/);
  assert.ok(text.indexOf("## Rules in dark") > text.indexOf("## Rules\n"));
  assert.match(brandText({ ...about, verified: "rust-lang.org" }, [], String), /verified: rust-lang.org/);
});

test("a card's tint, line, counts and age", async () => {
  const { ago, countsOf, taglineOf, tintOf } = await import("./hub.ts");
  const rules = [
    rule("color.red", "color", "#a72145"),
    rule("color.primary", "color", "#2a3439"),
    rule("brand.mission", "text", "Blender is the **free** and open source 3D suite. The freedom to create."),
    rule("type.body", "font", { family: "Fira Sans" }),
    rule("type.heading", "font", { family: "Fira Sans", weight: 700 }),
    rule("logo.mark", "text", "x", { assets: [asset("m", "image/svg+xml")] }),
    rule("logo.clearSpace", "text", "x"),
  ];
  assert.equal(tintOf(rules), "#2a3439");
  assert.equal(tintOf(rules.slice(0, 1)), "#a72145");
  assert.equal(tintOf([]), null);
  assert.equal(taglineOf(rules), "Blender is the free and open source 3D suite.");
  assert.equal(taglineOf([rule("brand.tagline", "text", "x".repeat(200))], 10), "xxxxxxxxx…");
  assert.equal(taglineOf([]), null);
  assert.deepEqual(countsOf(rules), { colors: 2, families: ["Fira Sans"], logos: 1 });
  const now = new Date("2026-09-30T12:00:00Z");
  assert.equal(ago("2026-09-27T12:00:00Z", now), "3 days ago");
  assert.equal(ago("2026-09-30T11:59:30Z", now), "just now");
  assert.equal(ago("2026-09-29T11:00:00Z", now), "yesterday");
});

test("the card's picture is the mark before the other logos", () => {
  const rules = [rule("logo.primary", "text", "x", { assets: [asset("p", "image/png")] }), rule("logo.mark", "text", "x", { assets: [asset("m", "image/png")] })];
  assert.equal(logoOf(rules)?.id, "m");
});

test("cookieDomain: the domain the app and its hub share, when it is a site's", () => {
  assert.equal(cookieDomain("https://app.artbucket.io", "https://hub.artbucket.io"), "artbucket.io");
  assert.equal(cookieDomain("https://app.example.com", "https://hub.brand.example.com"), "example.com");
  assert.equal(cookieDomain("https://app.artbucket.io", "https://hub.artbucket.io/hub"), "artbucket.io");
  assert.equal(cookieDomain("https://app.artbucket.io", "https://brandhub.dev"), null, "nothing shared");
  assert.equal(cookieDomain("https://app.artbucket.io", "https://hub.artbucket.dev"), null, "one label is not a site");
  assert.equal(cookieDomain("https://artbucket.io", "https://hub.artbucket.io"), null, "the app's own host");
  assert.equal(cookieDomain("http://localhost:3000", "http://localhost:3000/hub"), null, "the hub on the app's host");
  assert.equal(cookieDomain("http://localhost:3000", "http://hub.localhost:3000"), null, "a single label");
  assert.equal(cookieDomain("http://localhost:3000", undefined), null, "no hub");
});

test("withoutDomain drops the Domain attribute and nothing else", () => {
  assert.equal(
    withoutDomain("__Secure-better-auth.session_token=abc; Max-Age=604800; Path=/; Domain=artbucket.io; HttpOnly; Secure; SameSite=Lax"),
    "__Secure-better-auth.session_token=abc; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax",
  );
  assert.equal(withoutDomain("a=b; Path=/"), "a=b; Path=/");
});

test("expireHostOnly empties and expires the same cookie for the host alone", () => {
  assert.equal(
    expireHostOnly("__Secure-better-auth.session_token=abc; Max-Age=604800; Path=/; Domain=artbucket.io; HttpOnly; Secure; SameSite=Lax"),
    "__Secure-better-auth.session_token=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
  );
  assert.equal(expireHostOnly("a=b; Expires=Wed, 07 Oct 2026 09:00:00 GMT; Domain=x.io; Path=/"), "a=; Path=/; Max-Age=0");
});

test("hubHome: public brands on the hub, private ones there only when the session reaches it", () => {
  const app = "https://app.artbucket.io";
  assert.equal(hubHome("public", app, "https://hub.artbucket.io"), "https://hub.artbucket.io");
  assert.equal(hubHome("private", app, "https://hub.artbucket.io"), "https://hub.artbucket.io");
  assert.equal(hubHome("private", app, "https://brandhub.dev"), "https://app.artbucket.io/hub");
  assert.equal(hubHome("private", "http://localhost:3000", "http://localhost:3000/hub"), "http://localhost:3000/hub");
});

test("githubLogin takes a login or its profile URL, lowercased, and refuses what GitHub would", async () => {
  const { githubLogin, githubProofUrl } = await import("./hub.ts");
  assert.equal(githubLogin("rust-lang"), "rust-lang");
  assert.equal(githubLogin(" https://github.com/Rust-Lang/ "), "rust-lang");
  assert.equal(githubLogin("github.com/mozilla"), "mozilla");
  for (const bad of ["", "-x", "x-", "a--b", "a/b", "../x", "a".repeat(40), "x.y"]) assert.equal(githubLogin(bad), null, bad);
  assert.equal(githubProofUrl("rust-lang"), "https://raw.githubusercontent.com/rust-lang/.github/HEAD/artbucket-verification.txt");
});

test("compact counts, as cards show pulls", async () => {
  const { compact } = await import("./hub.ts");
  assert.deepEqual([0, 950, 1234, 12_000, 3_400_000].map(compact), ["0", "950", "1.2k", "12k", "3.4m"]);
});

test("parseHubRef reads what create_brand's from names on BrandHub", async () => {
  const { parseHubRef } = await import("./hub.ts");
  assert.deepEqual(parseHubRef("rust-lang/rust@12"), { org: "rust-lang", slug: "rust", version: 12 });
  assert.deepEqual(parseHubRef("mozilla/firefox"), { org: "mozilla", slug: "firefox" });
  for (const bad of ["rust", "a/b/c", "a/b@0", "A/b", "a/b@x", "/b", "a/"]) assert.equal(parseHubRef(bad), null, bad);
});

test("a verified host proves its domain, the names under it and the one above it, never a sibling", () => {
  for (const [host, domain] of [
    ["acme.com", "acme.com"],
    ["www.acme.com", "acme.com"],
    ["brand.acme.com", "acme.com"],
    ["acme.com", "shop.acme.com"],
    ["assets.eu.acme.co.uk", "acme.co.uk"],
  ]) assert.ok(provesDomain(host, domain), `${host} proves ${domain}`);
  for (const [host, domain] of [
    ["acme.org", "acme.com"],
    ["notacme.com", "acme.com"],
    ["acme.com.evil.example", "acme.com"],
    ["shop.acme.com", "blog.acme.com"],
    ["acme.com", "myacme.com"],
  ]) assert.ok(!provesDomain(host, domain), `${host} doesn't prove ${domain}`);
  assert.deepEqual(domainsAbove("www.brand.acme.co.uk"), ["brand.acme.co.uk", "acme.co.uk", "co.uk"]);
  assert.deepEqual(domainsAbove("acme.com"), ["acme.com"]);
});

test("a name under a zone that hands out names proves itself and what is under it, never the zone or a sibling", () => {
  for (const [host, domain] of [
    ["acme.github.io", "acme.github.io"],
    ["docs.acme.github.io", "acme.github.io"],
    ["acme.github.io", "docs.acme.github.io"],
    ["shop.acme.vercel.app", "acme.vercel.app"],
    ["brand.acme.co.uk", "acme.co.uk"],
  ]) assert.ok(provesDomain(host, domain), `${host} proves ${domain}`);
  for (const [host, domain] of [
    ["acme.github.io", "github.io"],
    ["docs.acme.github.io", "github.io"],
    ["acme.github.io", "other.github.io"],
    ["acme.vercel.app", "vercel.app"],
    ["acme.pages.dev", "pages.dev"],
    ["acme.duckdns.org", "duckdns.org"],
    ["acme.myshopify.com", "myshopify.com"],
    ["acme.co.uk", "co.uk"],
    ["github.io", "acme.github.io"],
    // www is the twin of a site, not of a zone that hands out names: whoever holds www there holds one name of it.
    ["www.duckdns.org", "duckdns.org"],
    ["www.github.io", "github.io"],
    ["www.co.uk", "co.uk"],
  ]) assert.ok(!provesDomain(host, domain), `${host} doesn't prove ${domain}`);
  assert.equal(claimProof("github.io", ["acme.github.io"], []), null);
  assert.equal(claimProof("acme.github.io", ["docs.acme.github.io"], []), "docs.acme.github.io");
});

test("a listing is offered to whoever proves its domain, unless its own organization does", () => {
  // Seeded, its organization proved nothing: offered, naming the host that proves it.
  assert.equal(claimProof("acme.com", ["brand.acme.com", "other.example"], []), "brand.acme.com");
  // Its organization proved the domain, or a name of it: no offer, even to another prover.
  assert.equal(claimProof("acme.com", ["acme.com"], ["www.acme.com"]), null);
  assert.equal(claimProof("acme.com", ["acme.com"], ["press.acme.com"]), null);
  // Its organization proved something else only: offered.
  assert.equal(claimProof("acme.com", ["acme.com"], ["unrelated.example"]), "acme.com");
  // No domain, or nothing the claimant proves: none.
  assert.equal(claimProof(null, ["acme.com"], []), null);
  assert.equal(claimProof("acme.com", ["acme.org"], []), null);
});
