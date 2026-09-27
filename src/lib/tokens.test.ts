import assert from "node:assert/strict";
import { test } from "node:test";
import { toCss, toDtcg, type TokenRule } from "./tokens.ts";

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
