import assert from "node:assert/strict";
import { test } from "node:test";
import { ase, colorsText, kitColors, kitFiles, kitReadme } from "./press-kit.ts";

const rule = (key: string, type: string, value: unknown, extra: Record<string, unknown> = {}) =>
  ({ key, type, value, context: null, label: null, usage: null, assets: [], ...extra }) as unknown as Parameters<typeof kitFiles>[0][number];
const file = (id: string, filename: string, mime: string, kept = false) => ({ id, filename, mime, ...(kept && { kept: true as const }) });

const RULES = [
  rule("color.primary", "color", "#6D4AFF", { label: "Violet", usage: "Buttons" }),
  rule("color.primary", "color", "#a48bff", { context: "dark-background" }),
  rule("color.gradient", "color", "linear-gradient(red, blue)"),
  rule("logo.primary", "text", "The logo", { label: "Logo", assets: [file("a", "logo.svg", "image/svg+xml"), file("b", "logo.svg", "image/svg+xml")] }),
  rule("logo.primary", "text", "The logo", { context: "dark-background", assets: [file("c", "white.png", "image/png"), file("d", "brief.pdf", "application/pdf")] }),
  rule("logo.mark", "text", "The mark", { assets: [file("e", "mark.svg", "image/svg+xml", true)] }),
  rule("type.heading", "font", { family: "Inter", weight: 700 }, { assets: [file("f", "Inter.woff2", "font/woff2")] }),
  rule("type.body", "font", { family: "Inter" }, { assets: [file("f", "Inter.woff2", "font/woff2")] }),
  rule("type.code", "font", "Berkeley Mono", { assets: [file("g", "Berkeley.woff2", "font/woff2", true)] }),
  rule("tone.always", "list", ["Say it plainly"]),
  rule("logo.neverDo", "list", ["Stretch it"]),
];

test("a kit's files: a folder per version, a PNG beside an SVG, one name per file, a family's files once, kept ones named", () => {
  const { files, left } = kitFiles(RULES);
  assert.deepEqual(
    files.map((f) => `${f.path} ${f.id}${f.png ? " png" : ""}`),
    [
      "logos/Logo/logo.svg a",
      "logos/Logo/logo.png a png",
      "logos/Logo/logo (2).svg b",
      "logos/Logo/logo (2).png b png",
      "logos/Logo (Dark background)/white.png c",
      "fonts/Inter/Inter.woff2 f",
    ],
  );
  assert.deepEqual(left, ["logos/Mark/mark.svg", "fonts/Berkeley Mono/Berkeley.woff2"]);
});

test("the palette: hex colors only, each version named, in words and as Adobe swatches", () => {
  const colors = kitColors(RULES);
  assert.deepEqual(colors.map((c) => `${c.name} ${c.hex}`), ["Violet #6d4aff", "Violet (Dark background) #a48bff"]);
  assert.match(colorsText(colors), /^Violet\n {2}HEX {2}#6D4AFF\n {2}RGB {2}109 74 255\n {2}CMYK 57 71 0 0\n {2}Use {2}Buttons\n\nViolet \(Dark background\)/);
  const bytes = ase(colors);
  const v = new DataView(bytes.buffer);
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 4)), "ASEF");
  assert.equal(v.getUint16(4), 1);
  assert.equal(v.getUint32(8), 2);
  // The first block: a color, its name in UTF-16 with its 0, RGB, three floats, normal.
  assert.equal(v.getUint16(12), 1);
  const n = v.getUint16(18);
  assert.equal(n, "Violet".length + 1);
  const at = 20 + n * 2;
  assert.equal(new TextDecoder().decode(bytes.subarray(at, at + 4)), "RGB ");
  assert.equal(Math.round(v.getFloat32(at + 4) * 255), 109);
  assert.equal(v.getUint16(at + 16), 2);
  assert.equal(v.getUint32(14), 2 + n * 2 + 4 + 12 + 2);
  assert.equal(bytes.length, 12 + 2 * 6 + v.getUint32(14) + (2 + ("Violet (Dark background)".length + 1) * 2 + 4 + 12 + 2));
});

test("the README: the release, its source when unverified, the licenses, the do's and don'ts, what was left out", () => {
  const plan = kitFiles(RULES);
  const about = { name: "Acme", owner: "Acme fans", verified: null, version: 4, publishedAt: "2026-10-01T10:00:00Z", url: "https://hub/acme/acme@4", guidelines: null, terms: null, note: "Logo refresh", source: "From acme.example's press page" };
  const licenses = new Map([["f", "SIL Open Font License"], ["g", "Commercial"]]);
  const readme = kitReadme(about, RULES, { ...plan, licenses });
  assert.match(readme, /^# Acme press kit\n\nAcme's brand from the Artbucket BrandHub, release @4 of 2026-10-01, listed by Acme fans, a community listing/);
  assert.match(readme, /## Source\n\nThis listing may not come from Acme's owner[^\n]*\n\nFrom acme\.example's press page\n/);
  assert.match(readme, /## Release @4\n\nLogo refresh/);
  assert.match(readme, /- \*\*Inter, 700\*\* \(Heading\)\. License: SIL Open Font License\. Its files are in `fonts\/`\./);
  assert.match(readme, /- \*\*Berkeley Mono\*\* \(Code\)\. License: Commercial\. Its files aren't in the kit/);
  assert.match(readme, /- Do: Say it plainly\n- Don't: Stretch it/);
  assert.match(readme, /- logos\/Mark\/mark\.svg\n- fonts\/Berkeley Mono\/Berkeley\.woff2\n$/);
  // Verified: no warning, no source section.
  assert.doesNotMatch(kitReadme({ ...about, verified: "acme.example" }, RULES, { ...plan, licenses }), /## Source/);
});
