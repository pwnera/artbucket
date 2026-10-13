import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Brand, loadBrand } from "../../kit/brand/index.js";
import { asks, doDont, logoGrid, palette, ruleList, ruleValue, typeSpecimen } from "../../kit/ui/html.js";
import { contrast, inkOn } from "./color.ts";

/**
 * The kit (kit/: @artbucket/brand and @artbucket/ui, MIT): what a site built
 * anywhere reads a release with and draws its rules with, the color math the
 * app's own palettes use.
 */

const LOGO = "0b6c2f0e-6a52-4a5e-9d3b-1f1a2c3d4e5f";
const rule = (key: string, type: string, value: unknown, extra: Record<string, unknown> = {}) => ({ key, type, value, context: null, label: null, usage: null, spec: null, assets: [], ...extra });
const RULES = [
  rule("color.primary", "color", "#6d4aff", { label: "Violet <b>", usage: "Buttons & links" }),
  rule("color.primary", "color", "#a48bff", { context: "dark-background" }),
  rule("color.gradient", "color", { stops: ["#000", "#fff"] }),
  rule("type.heading", "font", { family: 'Acme "Sans"' }),
  rule("logo.primary", "text", "The logo", { assets: [{ id: LOGO, file: `assets/${LOGO}.svg`, mime: "image/svg+xml" }] }),
  rule("tone.avoid", "list", ["jargon", "hype"]),
];

test("which rules a list asks for: a key, a group, every one", () => {
  assert.ok(asks("color.primary", ["color.*"]));
  assert.ok(asks("color.primary", ["*"]));
  assert.ok(asks("color.primary", undefined));
  assert.ok(!asks("colors.primary", ["color.*"]));
  assert.ok(!asks("color.primary", ["color.ink"]));
});

test("a palette: each color in its own chip with the ink that reads on it, its values and contrast, escaped; a context's values when asked", () => {
  const html = palette(RULES);
  assert.match(html, new RegExp(`<span class="ab-chip" style="background:#6d4aff;color:${inkOn("#6d4aff")}">Aa</span><b>Violet &#60;b&#62;</b><code>#6d4aff</code>`));
  assert.match(html, new RegExp(`<dt>On white</dt><dd>${contrast("#6d4aff", "#ffffff").toFixed(1)}:1 AA</dd>`));
  assert.match(html, /<p class="ab-usage">Buttons &#38; links<\/p>/);
  // A value that isn't a hex color is shown as words, never written into a style.
  assert.match(html, /<span class="ab-chip"><\/span><b>color\.gradient<\/b><code>\{&#34;stops&#34;/);
  assert.doesNotMatch(html, /#a48bff/);
  assert.match(palette(RULES, { context: "dark-background" }), /#a48bff/);
  assert.doesNotMatch(palette(RULES, { keys: ["color.gradient"] }), /#6d4aff/);
});

test("type, logos, the other rules and one rule's value, each escaped where it lands", () => {
  assert.match(typeSpecimen(RULES), /<li style="font-family:&#34;Acme \\&#34;Sans\\&#34;&#34;">/);
  assert.match(logoGrid(RULES), new RegExp(`<img src="/assets/${LOGO}.svg" alt="logo.primary">`));
  assert.match(logoGrid(RULES, { src: (a) => `https://cdn.example/${a.id}?x="1"` }), /src="https:\/\/cdn\.example\/[0-9a-f-]+\?x=&#34;1&#34;"/);
  assert.equal(ruleList(RULES), "<dl class=\"ab-rules\"><dt>tone.avoid</dt><dd>jargon, hype</dd></dl>");
  assert.match(ruleValue(RULES[0]), /<span class="ab-dot" style="background:#6d4aff"><\/span><code>#6d4aff<\/code>/);
  assert.equal(ruleValue(undefined), "");
  assert.match(doDont([{ verdict: "dont", title: "Stretch <it>", image: "/x.png" }, { text: "Give it room" }]), /<li class="ab-dont"><figure class="ab-tile"><img src="\/x\.png" alt="Stretch &#60;it&#62;"><\/figure><span class="ab-verdict">Don't<\/span><b>Stretch &#60;it&#62;<\/b><\/li><li class="ab-do"><span class="ab-verdict">Do<\/span><p>Give it room<\/p><\/li>/);
});

test("the brand SDK notes what the build reads: a key, a group, every rule; the files it uses, copied; the manifest says so", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kit-brand-"));
  mkdirSync(join(dir, ".brand", "assets"), { recursive: true });
  writeFileSync(join(dir, ".brand", "assets", `${LOGO}.svg`), "<svg/>");
  writeFileSync(join(dir, ".brand", "tokens.css"), `:root { --color-primary: #6d4aff; }\n@font-face { src: url("assets/${LOGO}.svg"); }\n`);
  writeFileSync(join(dir, ".brand", "brand.json"), JSON.stringify({ slug: "acme", name: "Acme", release: { number: 7 }, server: "https://app.example", rules: RULES, files: { [`assets/${LOGO}.svg`]: LOGO } }));
  const brand = await loadBrand(join(dir, ".brand"));
  assert.equal(brand.value("color.primary", null), "#6d4aff");
  assert.equal(brand.value("color.primary", null, "dark-background"), "#a48bff");
  assert.equal(brand.text("nope", "fallback"), "fallback");
  assert.equal(brand.pick("font", ["head"])?.key, "type.heading");
  brand.rules("tone.*");
  assert.deepEqual(brand.manifest(), { brand: "acme", release: 7, rules: ["color.primary", "nope", "tone.*", "type.*"], assets: [] });
  assert.equal(brand.file(RULES[4].assets[0]), `assets/${LOGO}.svg`);
  assert.equal(brand.liveUrl(LOGO, "w_400"), `https://app.example/c/${LOGO}/w_400`);
  const out = join(dir, "dist");
  await brand.copyFiles(out);
  assert.equal(readFileSync(join(out, "assets", `${LOGO}.svg`), "utf8"), "<svg/>");
  // tokens.css carries every rule.
  await brand.tokensCss();
  const m = await brand.writeManifest(out);
  assert.deepEqual(m, { brand: "acme", release: 7, rules: ["*"], assets: [LOGO] });
  assert.deepEqual(JSON.parse(readFileSync(join(out, "artbucket.site.json"), "utf8")), m);
  await assert.rejects(loadBrand(join(dir, "nowhere")), /export the brand first/);
  assert.equal(new Brand({ slug: "x", rules: [] }).release, null);
  assert.ok(!existsSync(join(dir, "nowhere")));
});

test("swatch: a color's values and the text set on it, as a portal's palette and the kit's both show them", async () => {
  const { colorValues, swatchInk, kebab } = await import("../../kit/ui/swatch.js");
  const violet = { key: "color.primaryDark", type: "color", value: "#6d4aff80", spec: { pair: "color.ink", token: "Violet-700", pantone: ["2725 C", "2725 U"], ral: "4005" } };
  const ink = { key: "color.ink", type: "color", value: "#111111" };
  assert.deepEqual(
    colorValues(violet).map((v) => `${v.label}: ${v.text}${v.converted ? " (converted)" : ""}`),
    ["HEX: #6d4aff80", "RGB: rgb(109 74 255 / 50%)", "HSL: hsl(252 100% 65%)", "Token: Violet-700", "CSS: var(--color-primary-dark)", "CMYK: C57 M71 Y0 K0 (converted)", "Pantone: 2725 C", "Pantone: 2725 U", "RAL: RAL 4005"],
  );
  assert.deepEqual(colorValues({ ...violet, spec: { cmyk: [60, 70, 0, 0] } }, ["cmyk"]), [{ label: "CMYK", text: "C60 M70 Y0 K0", converted: false }], "the book's own CMYK");
  const paired = swatchInk(violet, [violet, ink]);
  assert.equal(paired.ink, "#111111");
  assert.equal(paired.partner, ink);
  assert.equal(paired.ratio, contrast("#111111", "#6d4aff"));
  const alone = swatchInk({ ...violet, spec: {} });
  assert.deepEqual([alone.ink, alone.partner], [inkOn("#6d4aff"), null], "no pair: black or white, whichever reads");
  assert.equal(kebab("logo.minClearSpace"), "logo-min-clear-space");
});
