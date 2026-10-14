import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateSync } from "node:zlib";
import { dotx, officeFont, officeLook, pngSize, potx, SLOTS, themeXml } from "./office.ts";
import { crc32, unzip } from "./zip.ts";

const LOGO = "0b6c2f0e-6a52-4a5e-9d3b-1f1a2c3d4e5f";
const rule = (key: string, type: string, value: unknown, extra: Record<string, unknown> = {}) => ({ key, type, value, context: null, assets: [], spec: null, ...extra }) as Parameters<typeof officeLook>[1][number];
const RULES = [
  rule("color.primary", "color", "#6d4aff"),
  rule("color.ink", "color", "#1a1a2e"),
  rule("color.paper", "color", "#fdfcf8"),
  rule("color.sun", "color", "#ffb000"),
  rule("color.sea", "color", "#0077b6"),
  rule("color.primary", "color", "#a48bff", { context: "dark-background" }),
  rule("type.heading", "font", { family: 'Acme "Serif" & Co' }, { spec: { fallback: "Georgia, serif" } }),
  rule("type.body", "font", { family: "Inter" }, { spec: { fallback: "system-ui, sans-serif" } }),
  rule("logo.primary", "text", "The logo", { assets: [{ id: LOGO }] }),
];

/** A 4x2 PNG, enough for its header and a picture to place. */
function png(width = 4, height = 2) {
  const chunk = (type: string, data: Uint8Array) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const rows = Buffer.alloc((width * 3 + 1) * height);
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows)), chunk("IEND", new Uint8Array())]));
}

async function parts(bytes: Uint8Array) {
  const dec = new TextDecoder();
  return new Map(await Promise.all(unzip(bytes).map(async (e) => [e.name, e.name.endsWith(".png") ? "PNG" : dec.decode(await e.read())] as const)));
}

/** Every relationship's target is a part of the package, and every part but [Content_Types].xml has a content type. */
function wellFormed(files: Map<string, string>) {
  const types = files.get("[Content_Types].xml")!;
  for (const [name, text] of files) {
    if (name === "[Content_Types].xml") continue;
    const ext = name.slice(name.lastIndexOf(".") + 1);
    assert.ok(types.includes(`PartName="/${name}"`) || types.includes(`Extension="${ext}"`), `${name} has a content type`);
    if (name.endsWith(".png")) continue;
    assert.ok(text.startsWith("<?xml"), `${name} is XML`);
    if (!name.endsWith(".rels")) continue;
    const dir = name.replace(/_rels\/[^/]*\.rels$/, "");
    for (const [, target] of text.matchAll(/Target="([^"]+)"/g)) {
      const path = new URL(target, `file:///${dir}`).pathname.slice(1);
      assert.ok(files.has(path), `${name} points at ${path}, which is there`);
    }
  }
  for (const [, part] of types.matchAll(/PartName="\/([^"]+)"/g)) assert.ok(files.has(part), `${part} is listed and there`);
}

test("the look: ink and paper are dk1 and lt1, the accent accent1, the palette next, and tints where it runs short", () => {
  const l = officeLook("Acme", RULES);
  assert.equal(l.colors.dk1, "#1a1a2e");
  assert.equal(l.colors.lt1, "#fdfcf8");
  assert.equal(l.colors.accent1, "#6d4aff");
  assert.deepEqual([l.colors.accent2, l.colors.accent3], ["#ffb000", "#0077b6"]);
  // A context's color is not the palette's.
  assert.ok(!Object.values(l.colors).includes("#a48bff"));
  for (const s of SLOTS) assert.match(l.colors[s], /^#[0-9a-f]{6}$/, s);
  assert.equal(new Set([l.colors.accent4, l.colors.accent5, l.colors.accent6]).size, 3);
  assert.equal(l.dark, false);
  assert.deepEqual(l.logo, [LOGO]);
});

test("a dark paper is dk1, and the slides take it as their ground", async () => {
  const l = officeLook("Night", [rule("color.primary", "color", "#ff5a36"), rule("color.background", "color", "#101010"), rule("color.ink", "color", "#f5f5f5")]);
  assert.equal(l.dark, true);
  assert.equal(l.colors.dk1, "#101010");
  assert.equal(l.colors.lt1, "#f5f5f5");
  const master = (await parts(potx(l, null))).get("ppt/slideMasters/slideMaster1.xml")!;
  assert.match(master, /<p:clrMap bg1="dk1" tx1="lt1"/);
});

test("fonts: the family named, its kind and Word's stand-in from its fallback", () => {
  assert.deepEqual(officeFont({ family: "Inter", fallback: "system-ui, sans-serif" }), { family: "Inter", kind: "swiss", alt: "Arial" });
  assert.deepEqual(officeFont({ family: "Lora", fallback: "Georgia, serif" }), { family: "Lora", kind: "roman", alt: "Georgia" });
  assert.deepEqual(officeFont({ family: "JetBrains Mono" }), { family: "JetBrains Mono", kind: "modern", alt: "Courier New" });
  assert.deepEqual(officeFont(undefined), { family: "Arial", kind: "swiss", alt: "Arial" });
});

test("pngSize reads the header and refuses anything else", () => {
  assert.deepEqual(pngSize(png(300, 100)), { width: 300, height: 100 });
  assert.throws(() => pngSize(new TextEncoder().encode("<svg/>".padEnd(30))));
});

test("the .potx: a template's parts, every relationship resolved, the theme and the logo on the master and title layout", async () => {
  const l = officeLook("Acme", RULES);
  const files = await parts(potx(l, png(400, 100), new Date(2026, 0, 2)));
  wellFormed(files);
  assert.match(files.get("[Content_Types].xml")!, /presentationml\.template\.main\+xml/);
  const theme = files.get("ppt/theme/theme1.xml")!;
  assert.match(theme, /<a:dk1><a:srgbClr val="1A1A2E"\/><\/a:dk1><a:lt1><a:srgbClr val="FDFCF8"\/>/);
  assert.match(theme, /<a:accent1><a:srgbClr val="6D4AFF"\/>/);
  // The brand's words are escaped.
  assert.match(theme, /<a:majorFont><a:latin typeface="Acme &#34;Serif&#34; &#38; Co" panose="02020603050405020304" pitchFamily="18"/);
  assert.match(theme, /<a:minorFont><a:latin typeface="Inter" panose="020B0604020202020204" pitchFamily="34"/);
  assert.equal(files.get("ppt/media/logo.png"), "PNG");
  assert.match(files.get("ppt/slideMasters/_rels/slideMaster1.xml.rels")!, /Target="..\/media\/logo.png"/);
  assert.match(files.get("ppt/slideMasters/slideMaster1.xml")!, /<p:pic>.*r:embed="rId5"/);
  assert.match(files.get("ppt/slideLayouts/slideLayout1.xml")!, /type="title".*<p:pic>/);
  assert.match(files.get("ppt/slideLayouts/slideLayout2.xml")!, /type="obj"/);
  assert.match(files.get("ppt/slideLayouts/slideLayout3.xml")!, /type="secHead".*<a:schemeClr val="accent1"\/>/);
  assert.match(files.get("ppt/slides/slide1.xml")!, /<a:t>Acme<\/a:t>/);
});

test("the .dotx: a Word template with the theme, styles in its fonts and colors, and the logo in the header", async () => {
  const l = officeLook("Acme", RULES);
  const files = await parts(dotx(l, png()));
  wellFormed(files);
  assert.match(files.get("[Content_Types].xml")!, /wordprocessingml\.template\.main\+xml/);
  assert.equal(files.get("word/theme/theme1.xml"), themeXml(l));
  const styles = files.get("word/styles.xml")!;
  assert.match(styles, /w:styleId="Heading1".*w:asciiTheme="majorHAnsi".*w:themeColor="accent1"/);
  assert.match(files.get("word/fontTable.xml")!, /<w:font w:name="Inter"><w:altName w:val="Arial"\/><w:panose1 w:val="020B0604020202020204"\/><w:family w:val="swiss"\/>/);
  assert.match(files.get("word/document.xml")!, /<w:headerReference w:type="default" r:id="rId4"\/>/);
  assert.match(files.get("word/header1.xml")!, /<a:blip r:embed="rId1"\/>/);
});

test("without a logo, no picture and nothing that points at one", async () => {
  const l = officeLook("Plain", []);
  for (const bytes of [potx(l, null), dotx(l, null)]) {
    const files = await parts(bytes);
    wellFormed(files);
    assert.ok(![...files.keys()].some((n) => n.endsWith(".png") || n.includes("header")));
  }
  assert.equal(l.head.family, "Arial");
});

test("one release, one file: the same look and date make the same bytes", () => {
  const l = officeLook("Acme", RULES);
  const d = new Date(2026, 3, 1);
  assert.deepEqual(potx(l, png(), d), potx(l, png(), d));
  assert.deepEqual(dotx(l, png(), d), dotx(l, png(), d));
});
