import assert from "node:assert/strict";
import test from "node:test";
import { brandText, cookieDomain, hubHome, hubPath, logoOf, parseRef, swatches, withoutDomain } from "./hub.ts";

test("parseRef reads a brand and a pinned version, and nothing else", () => {
  assert.deepEqual(parseRef("rust"), { slug: "rust" });
  assert.deepEqual(parseRef("rust-lang@12"), { slug: "rust-lang", version: 12 });
  assert.deepEqual(parseRef("rust%4012"), { slug: "rust", version: 12 });
  for (const bad of ["", "Rust", "rust@0", "rust@", "rust@1.2", "-rust", "rust@x", "../x"]) assert.equal(parseRef(bad), null, bad);
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
