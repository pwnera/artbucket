import assert from "node:assert/strict";
import { test } from "node:test";
import { brandingFromEnv, customized, fileSlug, primaryOf, render } from "./branding.ts";
import { resolve } from "./settings.ts";

const draft = { to: "a@x.test", subject: "Reset your {product} password", lines: ["Welcome to {product}."], action: { label: "Open {product}", url: "https://x.test" } };

test("email carries the organization's brand, never the product's by accident", () => {
  const m = render(draft, { name: "Acme <Assets>", accent: "#ffcc00", logo: "https://x.test/a/1/h_64,f_png", emailFooter: "Acme Inc, 1 Main St" });
  assert.equal(m.subject, "Reset your Acme <Assets> password");
  assert.match(m.text, /^Welcome to Acme <Assets>\./);
  assert.match(m.text, /Acme Inc, 1 Main St$/);
  assert.match(m.html, /Acme &#60;Assets&#62;/);
  assert.doesNotMatch(m.html, /Artbucket|6D4AFF/i);
  // Dark ink on a light accent, so the button reads.
  assert.match(m.html, /background:#ffcc00;color:#111111/);
  assert.match(m.html, /<img src="https:\/\/x\.test\/a\/1\/h_64,f_png"/);
});

test("without a brand: the product's own look", () => {
  const m = render(draft, { name: "Artbucket", accent: null, logo: null, emailFooter: null });
  assert.match(m.html, /background:#6D4AFF;color:#ffffff/);
  assert.doesNotMatch(m.html, /<img/);
});

test("a one-time code sits large under the lines, in both parts", () => {
  const m = render({ to: "a@x.test", subject: "{product} code", lines: ["Enter this code."], code: "482913" }, { name: "Artbucket", accent: null, logo: null, emailFooter: null });
  assert.match(m.text, /Enter this code\.\n\n482913$/);
  assert.match(m.html, /letter-spacing:8px">482913</);
  assert.doesNotMatch(render(draft, { name: "A", accent: null, logo: null, emailFooter: null }).html, /letter-spacing/);
});

test("a line may link, and an unsubscribe link sits under the message, in both parts", () => {
  const m = render(
    { to: "a@x.test", subject: "Digest", lines: ["Released:", { text: "Acme @3", url: "https://x.test/brands/acme" }], unsubscribe: "https://x.test/unsubscribe/t" },
    { name: "Artbucket", accent: null, logo: null, emailFooter: null },
  );
  assert.match(m.text, /^Released:\nAcme @3 https:\/\/x\.test\/brands\/acme\n\nUnsubscribe: https:\/\/x\.test\/unsubscribe\/t$/);
  assert.match(m.html, /<a href="https:\/\/x\.test\/brands\/acme"[^>]*>Acme @3<\/a>/);
  assert.match(m.html, /<a href="https:\/\/x\.test\/unsubscribe\/t"[^>]*>Unsubscribe<\/a>/);
  assert.doesNotMatch(render(draft, { name: "A", accent: null, logo: null, emailFooter: null }).html, /Unsubscribe/);
});

test("a message in parts: its title, counts across, a list per part, in both parts", () => {
  const m = render(
    {
      to: "a@x.test",
      subject: "Your week in {product}",
      heading: { title: "Your week in {product}", sub: "Oct 5 to Oct 11" },
      stats: [{ value: "2", label: "releases" }],
      sections: [{ title: "Brand releases", rows: [{ text: "Acme @3", url: "https://x.test/brands/acme", meta: "Released", note: "A warmer accent" }], more: { text: "And 2 more", url: "https://x.test/library" } }],
      lines: ["You get this on Mondays."],
    },
    { name: "Acme", accent: "#ffcc00", logo: null, emailFooter: null },
  );
  assert.match(m.text, /^Your week in Acme\nOct 5 to Oct 11\n\n2 releases\n\nBRAND RELEASES\nAcme @3, Released, A warmer accent https:\/\/x\.test\/brands\/acme\nAnd 2 more https:\/\/x\.test\/library\n\nYou get this on Mondays\.$/);
  assert.match(m.html, /<h1[^>]*>Your week in Acme<\/h1>/);
  assert.match(m.html, /<a href="https:\/\/x\.test\/brands\/acme"[^>]*>Acme @3<\/a>/);
  assert.match(m.html, /border-top:4px solid #ffcc00/);
  // A plain message keeps the plain layout.
  assert.doesNotMatch(render(draft, { name: "A", accent: null, logo: null, emailFooter: null }).html, /<h1|<table/);
});

test("the server's BRAND_* sit under an organization's own, property by property", () => {
  const env = { BRAND_NAME: "Studio Assets", BRAND_ACCENT: "#112233" };
  assert.deepEqual(brandingFromEnv({}), null);
  const r = resolve("branding", { organization: { name: "Acme" } }, env);
  assert.equal(r.value.name, "Acme");
  assert.equal(r.value.accent, "#112233");
  assert.equal(r.sources.accent, "environment");
  assert.throws(() => brandingFromEnv({ BRAND_ACCENT: "red" }));
});

test("file names", () => {
  assert.equal(fileSlug("Acme Assets"), "acme-assets");
  assert.equal(fileSlug("Ünïcode Brand!"), "unicode-brand");
  assert.equal(fileSlug("!!!"), "assets");
});

test("an accent following a brand recolors the product without white-labeling it", () => {
  const own = resolve("branding", {}, {}).value;
  assert.equal(customized(own), false);
  assert.equal(customized({ ...own, accentFrom: "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b" }), false);
  assert.equal(customized({ ...own, accent: "#ff5b1f" }), true);
  // A value stored before accentFrom existed still reads, as none.
  assert.equal(resolve("branding", { organization: { name: "Acme", accent: "#ff5b1f" } }, {}).value.accentFrom, null);
});

test("the accent a release gives: its color.primary, for every context", () => {
  const rules = [
    { key: "color.primary", context: "dark-background", value: "#a592ff" },
    { key: "color.primary", context: null, value: "#6B4DFF" },
    { key: "color.ink", context: null, value: "#16152a" },
  ];
  assert.equal(primaryOf(rules), "#6b4dff");
  assert.equal(primaryOf(rules.slice(2)), null);
  assert.equal(primaryOf([{ key: "color.primary", context: null, value: { light: "#fff" } }]), null);
});
