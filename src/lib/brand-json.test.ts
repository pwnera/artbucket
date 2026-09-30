import assert from "node:assert/strict";
import test from "node:test";
import { brandJson, type BrandJsonRule } from "./brand-json.ts";

const img = (id: string, width = 400, height = 80, mime = "image/svg+xml") => ({ url: `https://f/${id}`, mime, title: null, filename: `${id}.svg`, width, height });
const rule = (key: string, type: BrandJsonRule["type"], value: unknown, extra: Partial<BrandJsonRule> = {}) =>
  ({ key, label: null, context: null, type, value, spec: null, usage: null, assets: [], ...extra }) as BrandJsonRule;
const base = { slug: "acme-outdoor", name: "Acme Outdoor", version: 5, publishedAt: "2026-09-29T17:21:08.831Z", verified: "acme.example", links: { rules: "https://hub/acme/rules.json" } };

test("a brand's identity, and its links for what brand.json can't say", () => {
  const out = brandJson({ ...base, rules: [rule("brand.tagline", "text", "Go further"), rule("brand.mission", "text", "Outdoors for all.")] });
  assert.equal(out.id, "acme_outdoor");
  assert.deepEqual(out.names, [{ en: "Acme Outdoor" }]);
  assert.equal(out.house_domain, "acme.example");
  assert.equal(out.url, "https://acme.example");
  assert.equal(out.tagline, "Go further");
  assert.equal(out.description, "Outdoors for all.");
  assert.equal(out.version, "5");
  assert.equal(out.last_updated, "2026-09-29T17:21:08.831Z");
  assert.deepEqual(out.ext, { artbucket: { release: 5, rules: "https://hub/acme/rules.json" } });
  // A GitHub proof is no house; nothing unset appears.
  const bare = brandJson({ ...base, verified: "github.com/acme", rules: [] });
  assert.equal(bare.house_domain, undefined);
  assert.deepEqual(Object.keys(bare).sort(), ["$schema", "ext", "id", "last_updated", "names", "version"]);
});

test("colors by name, AdCP's roles from the usual names, and pairs as colorways", () => {
  const out = brandJson({
    ...base,
    rules: [
      rule("color.primary", "color", "#ff7139", { spec: { pair: "color.ink" } }),
      rule("color.darkBlue", "color", "#0060dfcc"),
      rule("color.ink", "color", "#20123a"),
      rule("color.white", "color", "#ffffff"),
      rule("color.primary", "color", "#000000", { context: "dark-background" }),
      rule("color.never", "list", ["Orange on red"]),
    ],
  });
  assert.deepEqual(out.colors, { primary: "#ff7139", dark_blue: "#0060df", ink: "#20123a", white: "#ffffff", background: "#ffffff", text: "#20123a" });
  assert.deepEqual(out.visual_guidelines?.colorways, [{ name: "ink_on_primary", foreground: "#20123a", background: "#ff7139" }]);
  assert.deepEqual(out.visual_guidelines?.restrictions, ["Orange on red"]);
});

test("faces with their files, primary and secondary, and a type scale from their roles", () => {
  const woff = { url: "https://f/m.woff2", mime: "font/woff2", title: null, filename: "m.woff2" };
  const out = brandJson({
    ...base,
    rules: [
      rule("type.heading", "font", { family: "Metropolis", weight: 700 }, { spec: { role: "headline", case: "upper" }, assets: [woff] }),
      rule("type.body", "font", { family: "Inter", size: 16 }, { spec: { role: "body", fallback: "Arial, sans-serif", features: ["tnum"] } }),
    ],
  });
  assert.deepEqual(out.fonts?.heading, { family: "Metropolis", files: [{ url: "https://f/m.woff2" }] });
  assert.deepEqual(out.fonts?.primary, out.fonts?.heading);
  assert.deepEqual(out.fonts?.secondary, { family: "Inter", opentype_features: ["tnum"], fallbacks: ["Arial", "sans-serif"] });
  assert.deepEqual(out.visual_guidelines?.type_scale, {
    heading: { font: "heading", weight: "700", text_transform: "uppercase" },
    body: { font: "body", size: "16px" },
  });
});

test("logos from logo rules' images, never from a don't's examples; placement from size and clear space", () => {
  const out = brandJson({
    ...base,
    rules: [
      rule("logo.primary", "text", "The lockup", { usage: "Everywhere", assets: [img("p")] }),
      rule("logo.mark", "text", "The mark", { assets: [img("m", 512, 512)] }),
      rule("logo.reversed", "text", "White", { assets: [img("r")] }),
      rule("logo.vertical", "text", "Stacked", { assets: [img("v", 254, 172)] }),
      rule("logo.mono", "text", "One ink", { assets: [img("a", 80, 80), img("b", 80, 200)] }),
      rule("logo.primary", "text", "On dark", { context: "dark-background", assets: [img("d")] }),
      rule("logo.never", "list", ["Stretch it"], { assets: [img("bad")] }),
      rule("logo.clearSpace", "number", 1, { spec: { unit: "x", of: "the mark's height" } }),
      rule("logo.minSize", "number", 20, { spec: { unit: "px" } }),
    ],
  });
  const logos = out.logos!;
  assert.deepEqual(logos.map((l) => l.id), ["primary", "mark", "reversed", "vertical", "mono", "mono_2", "primary_dark_background"]);
  assert.deepEqual(logos.map((l) => l.variant), ["primary", "icon", "secondary", "secondary", "secondary", "secondary", "primary"]);
  assert.deepEqual(logos.map((l) => l.orientation), ["horizontal", "square", "horizontal", "stacked", "square", "vertical", "horizontal"]);
  assert.deepEqual(logos.map((l) => l.background ?? null), [null, null, "dark-bg", null, null, null, "dark-bg"]);
  assert.equal(logos[0].usage, "Everywhere");
  assert.deepEqual(logos[1].slots, ["favicon", "app_icon", "profile_mark"]);
  assert.deepEqual(out.visual_guidelines?.logo_placement, { min_clear_space: "1x the mark's height", min_height: "20px" });
  assert.deepEqual(out.visual_guidelines?.restrictions, ["Stretch it"]);
});

test("voice, imagery and disclaimers", () => {
  const out = brandJson({
    ...base,
    rules: [
      rule("tone.voice", "text", "Plain and warm."),
      rule("tone.pillars", "list", ["Sincere"]),
      rule("tone.always", "list", ["Say what it does"]),
      rule("tone.avoid", "list", ["Hype", 3]),
      rule("imagery.product", "text", "Real use", { usage: "Screens as people see them", assets: [img("s", 1200, 800, "image/png"), img("t", 1200, 800, "image/png")] }),
      rule("legal.disclaimer", "text", "Not affiliated."),
    ],
  });
  assert.deepEqual(out.tone, { voice: "Plain and warm.", attributes: ["Sincere"], dos: ["Say what it does"], donts: ["Hype", "3"] });
  assert.deepEqual(out.assets?.map((a) => [a.asset_id, a.asset_type, a.format, a.description]), [
    ["product", "image", "png", "Screens as people see them"],
    ["product_2", "image", "png", "Screens as people see them"],
  ]);
  assert.deepEqual(out.disclaimers, [{ text: "Not affiliated." }]);
});
