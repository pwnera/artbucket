import assert from "node:assert/strict";
import { test } from "node:test";
import { brandingFromEnv, fileSlug, render } from "./branding.ts";
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
