import assert from "node:assert/strict";
import { test } from "node:test";
import { toCss, toDtcg, TOKEN_FORMATS, type TokenRule } from "./tokens.ts";

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

test("Every format renders, and none carries guidance", () => {
  for (const [id, f] of Object.entries(TOKEN_FORMATS)) {
    const out = f.render(RULES, OPTS);
    assert.ok(out.length > 0, id);
    assert.ok(!out.includes("Hype"), `${id} leaks a do/don't list`);
  }
});
