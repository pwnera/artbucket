import assert from "node:assert/strict";
import test from "node:test";
import { brandJson, fromBrandJson, localized, type BrandJsonFile, type BrandJsonRule } from "./brand-json.ts";
import { RuleInput } from "./rules.ts";
import { TEMPLATES } from "./templates/index.ts";

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
  // The brand's own domain is its url; the house stays the verified one.
  const shop = brandJson({ ...base, domain: "shop.acme.example", rules: [] });
  assert.deepEqual([shop.url, shop.house_domain], ["https://shop.acme.example", "acme.example"]);
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

test("a wordmark is a wordmark, not an icon, and gets no icon slots", () => {
  const out = brandJson({ ...base, rules: [rule("logo.wordmark", "text", "The name", { assets: [img("w", 600, 120)] }), rule("logo.symbol", "text", "The symbol", { assets: [img("s", 64, 64)] })] });
  assert.deepEqual(
    out.logos!.map((l) => [l.variant, l.slots ?? null]),
    [
      ["wordmark", null],
      ["icon", ["favicon", "app_icon", "profile_mark"]],
    ],
  );
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

// ---- the way back ------------------------------------------------------------------------

const MIME: Record<string, string> = { svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", webp: "image/webp", woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf" };
/** Rules as set_rules takes them, their assets files by id, as the export reads them. */
const asExported = (rules: unknown[], files: Record<string, BrandJsonFile>) =>
  rules.map((raw) => {
    const r = RuleInput.parse(raw);
    return {
      ...rule(r.key, r.type, r.value, { label: r.label ?? null, context: r.context ?? null, usage: r.usage ?? null, spec: ("spec" in r && r.spec) || null }),
      assets: (r.assets ?? []).map(({ id }) => ({ url: files[id].url, filename: files[id].filename, title: files[id].title ?? null, mime: MIME[files[id].filename.split(".").pop()!] ?? "application/octet-stream" })),
    };
  });

test("Firefox's export comes back as the same brand.json", () => {
  const t = TEMPLATES.firefox;
  const firefox = { ...base, slug: "firefox", name: "Firefox", verified: "firefox.com" };
  const out = brandJson({ ...firefox, rules: asExported(t.rules, t.assets) });
  const { brands, refs } = fromBrandJson(out);
  assert.deepEqual(refs, []);
  assert.equal(brands.length, 1);
  const [b] = brands;
  assert.deepEqual([b.id, b.name, b.slug, b.domain], ["firefox", "Firefox", "firefox", "firefox.com"]);
  for (const r of b.rules) RuleInput.parse(r);
  assert.deepEqual(brandJson({ ...firefox, rules: asExported(b.rules, b.files) }), out);
  // Each file once, where the document had it; the logos' don'ts and the export's aliases add nothing.
  assert.equal(Object.keys(b.files).length, new Set(Object.values(b.files).map((f) => f.url)).size);
  assert.ok(!b.rules.some((r) => r.key === "type.primary" || r.key === "color.text"));
  // The house is the verified domain's, which the brand's domain carries: the canon has no other place for it.
  assert.deepEqual(b.dropped, ["house_domain"]);
});

test("a House Portfolio gives each of its brands, and the children that publish their own", () => {
  const out = fromBrandJson(
    {
      house: { domain: "talpanetwork.com", name: "Talpa Network" },
      brands: [
        { id: "talpa_network", names: [{ en_US: "Talpa Network" }, { nl_NL: "Talpa Network" }], keller_type: "master" },
        { id: "radio_538", names: [{ nl: "538" }], url: "https://www.538.nl/", colors: { primary: "#E30613", accent: ["#ffffff", "#000000"] } },
        { id: "kijk", names: [{ en: "KIJK" }], properties: [{ type: "website", identifier: "kijk.nl", primary: true }] },
      ],
      brand_refs: [{ domain: "radio10.nl", brand_id: "radio10" }, { domain: "nope" }],
    },
    { domain: "538.nl" },
  );
  assert.deepEqual(out.brands.map((b) => [b.id, b.name, b.slug, b.domain]), [
    ["talpa_network", "Talpa Network", "talpa-network", "talpanetwork.com"],
    ["radio_538", "538", "radio-538", "538.nl"],
    ["kijk", "KIJK", "kijk", "kijk.nl"],
  ]);
  assert.deepEqual(out.refs, [{ domain: "radio10.nl", id: "radio10" }]);
  assert.deepEqual(out.brands[0].dropped, ["keller_type"]);
  assert.deepEqual(out.brands[1].rules.map((r) => [r.key, r.value]), [["color.primary", "#e30613"], ["color.accent", "#ffffff"], ["color.accent2", "#000000"]]);
});

test("redirects, house redirects and brand agents give no brand, and say where to go", () => {
  assert.deepEqual(fromBrandJson({ authoritative_location: "https://hub.example/acme/brand.json" }), { brands: [], refs: [], location: "https://hub.example/acme/brand.json" });
  assert.match(fromBrandJson({ house: "nikeinc.com" }).none!, /nikeinc\.com/);
  assert.match(fromBrandJson({ brand_agent: { url: "https://agent.example/mcp", id: "a" } }).none!, /brand agent/);
  assert.match(fromBrandJson([]).none!, /Not a brand\.json/);
});

test("localized fields resolve in AdCP's order, never to the first translation", () => {
  const voice = [{ "en-GB": "Warm" }, { fr: "Chaleureux" }, { fr_CA: "Chaleureux, eh" }];
  const str = (x: unknown): x is string => typeof x === "string";
  assert.equal(localized(voice, "en-GB", "en", str), "Warm");
  assert.equal(localized(voice, "fr-CA", "en", str), "Chaleureux, eh");
  assert.equal(localized(voice, "fr-BE", "en", str), "Chaleureux");
  assert.equal(localized(voice, "de", "fr", str), "Chaleureux");
  assert.equal(localized(voice, "de", "en-GB", str), "Warm");
  assert.equal(localized(voice, "de", "es", str), undefined);
  assert.equal(localized(voice, "en", "en", str), undefined);
  assert.equal(localized("Plain", "de", "es", str), "Plain");

  const [b] = fromBrandJson({
    default_language: "fr",
    id: "acme",
    names: [{ de: "Acme GmbH" }],
    tone: {
      voice: [{ de: "Warm" }, { fr: "Chaleureux" }],
      attributes: [{ fr: ["simple", "direct"] }, { en: ["plain", "direct"] }],
      dos: ["Dire ce que ça fait"],
      donts: [{ de: ["Übertreiben"] }],
    },
    assets: [{ asset_id: "hero", asset_type: "image", url: "https://cdn.example/hero.jpg", name: [{ es: "Héroe" }], description: [{ en: "Summer hero" }, { fr: "Visuel été" }] }],
  }).brands;
  // No name in English or French: a brand needs one, so the first; the voice in French, the default; the attributes whole, in English.
  assert.equal(b.name, "Acme GmbH");
  assert.deepEqual(b.rules.filter((r) => r.key.startsWith("tone.")).map((r) => [r.key, r.value]), [
    ["tone.voice", "Chaleureux"],
    ["tone.attributes", ["plain", "direct"]],
    ["tone.always", ["Dire ce que ça fait"]],
  ]);
  assert.ok(b.dropped.includes("tone.donts"));
  const hero = b.rules.find((r) => r.key === "imagery.library")!;
  assert.equal(hero.usage, "Summer hero");
  assert.equal(Object.values(b.files)[0].title, undefined);
});

test("anyone's brand.json: variants and backgrounds as logo rules, CSS stacks as faces, and what has no place is named", () => {
  const [b] = fromBrandJson(
    {
      id: "spotwise",
      names: [{ en: "Spotwise" }],
      industries: ["Advertising Technology"],
      industry: "Technology",
      tagline: "The Agentic OS",
      fonts: { primary: "Geist Sans, 'Helvetica Neue', sans-serif", mono: "Geist Mono" },
      colors: { primary: "#2c7dff", background: "#2C7DFF", text: "#111111", bad: "blue" },
      logos: [
        { url: "https://spotwise.ai/logo.svg", variant: "primary", theme: "light" },
        { url: "https://spotwise.ai/logo-white.svg", variant: "primary", theme: "dark" },
        { url: "https://spotwise.ai/icon.png", variant: "icon", usage: "App icon" },
        { url: "https://spotwise.ai/logo.svg", tags: ["logo", "wordmark", "dark-bg"] },
        { url: "http://insecure.example/logo.png" },
      ],
      visual_guidelines: {
        logo_placement: { min_height: "24px", min_clear_space: "0.5x", preferred_position: "top-left" },
        type_scale: { heading: { font: "primary", size: "48px", weight: "bold", line_height: "1.1", letter_spacing: "-0.02em", text_transform: "uppercase" } },
        spacing: { scale: { xs: "4px", sm: "8px", md: "1rem" } },
        colorways: [{ name: "inverted", foreground: "#111111", background: "#2c7dff" }],
        restrictions: ["Never stretch the logo"],
        motion: { speed: "fast" },
      },
      disclaimers: [{ text: "Results vary." }, { text: "Terms apply." }],
      properties: [{ type: "website", identifier: "www.spotwise.ai", primary: true }],
    },
    { domain: "elsewhere.example" },
  ).brands;
  assert.equal(b.domain, "spotwise.ai");
  const by = new Map(b.rules.map((r) => [`${r.key}|${r.context ?? ""}`, r as { key: string; value: unknown; usage?: string | null; spec?: unknown; assets?: unknown[] }]));
  assert.deepEqual(by.get("color.primary|")?.spec, { pair: "color.text" });
  assert.equal(by.get("color.background|"), undefined, "background adds no color");
  assert.deepEqual(by.get("type.primary|"), { key: "type.primary", type: "font", value: { family: "Geist Sans", size: 48, weight: 700 }, spec: { fallback: "Helvetica Neue, sans-serif", role: "headline", lineHeight: 1.1, tracking: -0.02, case: "upper" } });
  assert.deepEqual(by.get("type.mono|")?.value, { family: "Geist Mono" });
  const file = (url: string) => Object.entries(b.files).find(([, f]) => f.url === url)![0];
  assert.deepEqual(by.get("logo.primary|")?.assets, [file("https://spotwise.ai/logo.svg")]);
  assert.deepEqual(by.get("logo.primary|dark-background")?.assets, [file("https://spotwise.ai/logo-white.svg")]);
  assert.deepEqual([by.get("logo.mark|")?.value, by.get("logo.mark|")?.usage], ["App icon", "App icon"]);
  assert.deepEqual(by.get("logo.wordmark|dark-background")?.assets, [file("https://spotwise.ai/logo.svg")]);
  assert.equal(Object.keys(b.files).length, 3);
  assert.deepEqual([by.get("logo.minSize|")?.value, by.get("logo.minSize|")?.spec], [24, { unit: "px" }]);
  assert.deepEqual([by.get("logo.clearSpace|")?.value, by.get("logo.clearSpace|")?.spec], [0.5, { unit: "x" }]);
  assert.deepEqual(by.get("space.scale|")?.value, [4, 8, "1rem"]);
  assert.deepEqual(by.get("logo.never|")?.value, ["Never stretch the logo"]);
  assert.equal(by.get("legal.disclaimer|")?.value, "Results vary.\n\nTerms apply.");
  assert.deepEqual(b.dropped, ["industry", "colors.bad", "visual_guidelines.motion", "logos[4]", "visual_guidelines.logo_placement.preferred_position"]);
  for (const r of b.rules) RuleInput.parse(r);
});
