import assert from "node:assert/strict";
import { test } from "node:test";
import { brandTheme } from "./brand-theme.ts";
import type { RuleSpec } from "./rules.ts";
import { gradientCss, toCss, toDtcg, TOKEN_FORMATS, type TokenRule } from "./tokens.ts";

const file = (id: string, filename: string) => ({ id, rendition: null, filename, mime: "font/ttf" });
const RULES: TokenRule[] = [
  { key: "color.primary", type: "color", value: "#0f62fe", usage: "Buttons and links */ body{}", assets: [] },
  { key: "color.overlay", type: "color", value: "#00000080", usage: null, assets: [] },
  { key: "logo.minSize", type: "number", value: 24, usage: null, assets: [] },
  {
    key: "type.headings",
    type: "font",
    value: { family: "IBM Plex Sans", size: 32, weight: 700 },
    usage: null,
    assets: [file("a1", "IBMPlexSans-Bold.ttf"), file("a2", "IBMPlexSans-Italic.ttf")],
  },
  { key: "type.scale", type: "list", value: [12, 16, 24], usage: null, assets: [file("a1", "IBMPlexSans-Bold.ttf")] },
  { key: "type.bodyCopy", type: "text", value: "Set body in it", usage: null, assets: [file("a1", "IBMPlexSans-Bold.ttf")] },
  { key: "tone.avoid", type: "list", value: ["Hype"], usage: null, assets: [] },
  { key: "tone.voice", type: "text", value: "Plain and warm", usage: null, assets: [] },
];

test("CSS: one custom property per value, fonts with their files", () => {
  const css = toCss(RULES, { origin: "https://dam.example", title: "acme tokens" });
  for (const line of [
    "--color-primary: #0f62fe;",
    "--color-overlay: #00000080;",
    "--logo-min-size: 24;",
    '--type-headings-font-family: "IBM Plex Sans";',
    "--type-headings-font-size: 32px;",
    "--type-headings-font-weight: 700;",
    "--type-scale-1: 12px;",
    "--type-scale-3: 24px;",
    "--type-scale-font-family: var(--type-headings-font-family);",
    "--type-body-copy-font-weight: var(--type-headings-font-weight);",
    'src: url("https://dam.example/a/a1") format("truetype");',
    "font-style: italic;",
  ])
    assert.ok(css.includes(line), `missing: ${line}\n${css}`);
  // A usage can't close its comment and inject rules.
  assert.ok(!css.includes("*/ body{}"));
  assert.equal(css.match(/@font-face/g)?.length, 2, "one face per file, however many rules carry it");
  assert.ok(!css.includes("tone"), "guidance is not a token");
});

test("DTCG: typed tokens, grouped by key; set-in rules alias the font", () => {
  const t = toDtcg(RULES, { origin: "https://dam.example" });
  const at = (path: string) => path.split("/").reduce<unknown>((x, k) => (x as Record<string, unknown> | undefined)?.[k], t);
  assert.deepEqual(at("color/primary/$value"), { colorSpace: "srgb", components: [0.0588, 0.3843, 0.9961], hex: "#0f62fe" });
  assert.equal(at("color/primary/$type"), "color");
  assert.equal(at("color/overlay/$value/alpha"), 0.502);
  assert.deepEqual(at("logo/minSize"), { $type: "number", $value: 24 });
  assert.deepEqual(at("type/headings/fontSize"), { $type: "dimension", $value: { value: 32, unit: "px" } });
  assert.deepEqual(at("type/headings/fontWeight"), { $type: "fontWeight", $value: 700 });
  assert.equal(at("type/headings/$extensions/com.artbucket/files/1/style"), "italic");
  assert.deepEqual(at("type/scale/2"), { $type: "dimension", $value: { value: 16, unit: "px" } });
  assert.equal(at("type/scale/fontFamily/$value"), "{type.headings.fontFamily}");
  assert.equal(at("type/bodyCopy/fontWeight/$value"), "{type.headings.fontWeight}");
  assert.equal(at("tone"), undefined);
});

const OPTS = { origin: "https://dam.example", title: "acme tokens" };
const has = (out: string, lines: string[]) => {
  for (const line of lines) assert.ok(out.includes(line), `missing: ${line}\n${out}`);
};

test("Sass and Less: the CSS variables in their syntax, aliases included", () => {
  has(TOKEN_FORMATS.scss.render(RULES, OPTS), ["$color-primary: #0f62fe;", "$type-scale-font-family: $type-headings-font-family;", "@font-face {"]);
  has(TOKEN_FORMATS.less.render(RULES, OPTS), ["@color-primary: #0f62fe;", "@type-scale-2: 16px;"]);
});

test("Tailwind 4: the brand in Tailwind's namespaces; numbers stay plain", () => {
  const css = TOKEN_FORMATS.tailwind.render(RULES, OPTS);
  const theme = css.slice(css.indexOf("@theme {"), css.indexOf("}\n:root"));
  for (const line of ["--color-primary: #0f62fe;", '--font-headings: "IBM Plex Sans";', "--text-headings: 32px;", "--font-weight-headings: 700;", "--text-scale-1: 12px;"])
    assert.ok(theme.includes(line), `missing in @theme: ${line}\n${css}`);
  assert.ok(css.slice(css.indexOf(":root")).includes("--logo-min-size: 24;"));
});

test("TypeScript and Tailwind 3: object literals that run", () => {
  const ts = TOKEN_FORMATS.ts.render(RULES, OPTS);
  const tokens = new Function(ts.replace(/^\/\/.*$/m, "").replace("export const tokens =", "return").replace(/ as const;[\s\S]*/, ";"))();
  assert.equal(tokens.color.primary, "#0f62fe");
  assert.deepEqual(tokens.type.scale, ["12px", "16px", "24px"]);
  assert.equal(tokens.type.headings.files[1].style, "italic");
  const tw = TOKEN_FORMATS.tailwind3.render(RULES, OPTS);
  const config = new Function(tw.replace("export default", "return"))();
  assert.deepEqual(config.theme.extend.fontFamily.headings, ["IBM Plex Sans"]);
  assert.equal(config.theme.extend.fontSize["scale-3"], "24px");
});

test("shadcn/ui: brand colors by shadcn's names take their place, with a readable foreground", () => {
  const css = TOKEN_FORMATS.shadcn.render(RULES, OPTS);
  has(css, ["--primary: #0f62fe;", "--primary-foreground: #ffffff;", "--overlay: #00000080;", "--color-overlay: var(--overlay);"]);
  assert.ok(!css.includes("--color-primary:"), "shadcn already maps its own names");
});

test("MUI and Chakra: palette and typography, tokens with values", () => {
  has(TOKEN_FORMATS.mui.render(RULES, OPTS), ['primary: {\n      main: "#0f62fe"', "createTheme("]);
  has(TOKEN_FORMATS.chakra.render(RULES, OPTS), ['primary: {\n          value: "#0f62fe"', "createSystem(defaultConfig, config)"]);
});

test("Every format renders, and none carries guidance but DESIGN.md", () => {
  for (const [id, f] of Object.entries(TOKEN_FORMATS)) {
    const out = f.render(RULES, OPTS);
    assert.ok(out.length > 0, id);
    if (id !== "designmd") assert.ok(!out.includes("Hype"), `${id} leaks a do/don't list`);
  }
});

test("DESIGN.md: tokens up front, the guidance below, in the spec's order", () => {
  const md = TOKEN_FORMATS.designmd.render(
    [...RULES, { key: "shape.radius", type: "number", value: 6, usage: null, assets: [] }, { key: "tone.do", type: "list", value: ["Say it plainly"], usage: null, assets: [] }],
    { origin: "https://dam.example", title: "acme design tokens, from artbucket." },
  );
  has(md, [
    "---\nversion: alpha\nname: \"acme\"",
    'colors:\n  primary: "#0f62fe"\n  overlay: "#00000080"',
    'typography:\n  headings:\n    fontFamily: "IBM Plex Sans"\n    fontSize: 32px\n    fontWeight: 700',
    "rounded:\n  shape-radius: 6px",
    "# acme",
    "- **Tone voice:** Plain and warm",
    "- **Primary (#0f62fe):** Buttons and links */ body{}",
    "- **Scale (12, 16, 24px):**",
    "- **Body copy:** Set body in it",
    "- Do: Say it plainly",
    "- Don't: Hype",
  ]);
  const order = ["## Overview", "## Colors", "## Typography", "## Layout", "## Shapes", "## Do's and Don'ts"].map((h) => md.indexOf(h));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), md);
  // No color named primary: the first one stands in, by reference.
  has(TOKEN_FORMATS.designmd.render([{ key: "color.orange", type: "color", value: "#e87d0d", usage: null, assets: [] }], OPTS), ['primary: "{colors.orange}"']);
});

test("Tokens name the faces the page is set in", () => {
  const font = (key: string, family: string, spec?: RuleSpec) =>
    ({ key, type: "font", value: { family }, usage: null, assets: [], context: null, spec }) as TokenRule & { context: null };
  const fixtures = {
    named: [font("type.primary", "Inter"), font("type.heading", "Space Grotesk")],
    roles: [font("type.heading", "Inter", { role: "body" }), font("type.feature", "Canela", { role: "headline" }), font("type.code", "JetBrains Mono")],
    first: [font("type.sans", "Inter"), font("type.heading", "Space Grotesk"), font("type.serif", "Tiempos")],
    headFirst: [font("type.heading", "Space Grotesk"), font("type.sans", "Inter")],
    unnamed: [font("type.heading", "Space Grotesk"), font("type.code", "JetBrains Mono"), font("type.mainText", "Inter")],
  };
  for (const [name, rules] of Object.entries(fixtures)) {
    const page = brandTheme(rules);
    const css = TOKEN_FORMATS.shadcn.render(rules, OPTS);
    const mui = TOKEN_FORMATS.mui.render(rules, OPTS);
    has(css, [`--font-sans: "${page.body?.family}";`, `--font-heading: "${page.head?.family}";`]);
    has(mui, [`fontFamily: "\\"${page.body?.family}\\", sans-serif"`, `h1: {\n      fontFamily: "\\"${page.head?.family}\\", sans-serif"`]);
    assert.notEqual(page.head?.family, page.body?.family, name);
  }
  // Heading listed first: text is the other face, and never a code face.
  assert.equal(brandTheme(fixtures.headFirst).body?.family, "Inter");
  assert.equal(brandTheme(fixtures.unnamed).body?.family, "Inter");
});

test("Gradients: live CSS beside the solid, in every format", () => {
  const blend: TokenRule = {
    key: "color.blend",
    type: "color",
    value: "#0f62fe",
    usage: "Covers only",
    assets: [],
    spec: { gradient: { kind: "linear", angle: 135, stops: [{ color: "color.primary" }, { color: "#ffffff", opacity: 0.5 }, { color: "color.overlay", at: 100 }] } },
  };
  // Listed before the colors it reads, so Sass's declare-before-use is exercised.
  const rules = [blend, ...RULES];
  const css = TOKEN_FORMATS.css.render(rules, OPTS);
  has(css, [
    "--color-blend: #0f62fe;",
    "--color-blend-gradient: linear-gradient(135deg, var(--color-primary), color-mix(in srgb, #ffffff 50%, transparent), var(--color-overlay) 100%);",
  ]);
  const scss = TOKEN_FORMATS.scss.render(rules, OPTS);
  has(scss, ["$color-blend-gradient: linear-gradient(135deg, $color-primary, color-mix(in srgb, #ffffff 50%, transparent), $color-overlay 100%);"]);
  assert.ok(scss.indexOf("$color-blend-gradient:") > scss.indexOf("$color-overlay:"), "declared after the colors it reads");
  has(TOKEN_FORMATS.less.render(rules, OPTS), ["@color-blend-gradient: linear-gradient(135deg, @color-primary,"]);
  has(TOKEN_FORMATS.tailwind.render(rules, OPTS), ["--background-image-blend-gradient: linear-gradient(135deg, var(--color-primary),"]);
  has(TOKEN_FORMATS.shadcn.render(rules, OPTS), ["--blend-gradient: linear-gradient(135deg, var(--primary),", "--background-image-blend-gradient: var(--blend-gradient);"]);

  // Where no variable reaches, the stops are hexes.
  const solid = "linear-gradient(135deg, #0f62fe, color-mix(in srgb, #ffffff 50%, transparent), #00000080 100%)";
  const tokens = new Function(TOKEN_FORMATS.ts.render(rules, OPTS).replace(/^\/\/.*$/m, "").replace("export const tokens =", "return").replace(/ as const;[\s\S]*/, ";"))();
  assert.equal(tokens.color.blend, "#0f62fe");
  assert.equal(tokens.color.blendGradient, solid);
  const tw = new Function(TOKEN_FORMATS.tailwind3.render(rules, OPTS).replace("export default", "return"))();
  assert.equal(tw.theme.extend.backgroundImage["blend-gradient"], solid);
  has(TOKEN_FORMATS.mui.render(rules, OPTS), [`gradient: ${JSON.stringify(solid)}`]);
  has(TOKEN_FORMATS.chakra.render(rules, OPTS), [`gradients: {\n        blend: {\n          value: ${JSON.stringify(solid)}`]);

  // DTCG: a gradient token beside the color, rules by reference, positions spread as CSS spreads them.
  const t = toDtcg(rules, { origin: "https://dam.example" }) as { color: Record<string, Record<string, unknown>> };
  assert.equal(t.color.blend.$type, "color");
  assert.equal(t.color.blendGradient.$type, "gradient");
  assert.equal(t.color.blendGradient.$description, "Covers only");
  assert.deepEqual(t.color.blendGradient.$value, [
    { color: "{color.primary}", position: 0 },
    { color: { colorSpace: "srgb", components: [1, 1, 1], alpha: 0.5, hex: "#ffffff" }, position: 0.5 },
    { color: "{color.overlay}", position: 1 },
  ]);
  assert.deepEqual(t.color.blendGradient.$extensions, { "com.artbucket": { kind: "linear", angle: 135, css: solid } });
});

test("gradientCss: radial takes no angle, conic turns from it", () => {
  const stops = [{ color: "#000000" }, { color: "#ffffff", at: 60 }];
  assert.equal(gradientCss({ kind: "radial", angle: 90, stops }, (c) => c), "radial-gradient(#000000, #ffffff 60%)");
  assert.equal(gradientCss({ kind: "conic", angle: 90, stops }, (c) => c), "conic-gradient(from 90deg, #000000, #ffffff 60%)");
  assert.equal(gradientCss({ stops }, (c) => c), "linear-gradient(#000000, #ffffff 60%)");
});
