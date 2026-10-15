import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { officeLook, potx, themeXml } from "./office.ts";
import { inspect, retheme, rethemeXml, templateKind } from "./office-template.ts";
import { unzip } from "./zip.ts";

type R = Parameters<typeof officeLook>[1][number];
const rule = (key: string, type: string, value: unknown, spec: unknown = null) => ({ key, type, value, context: null, assets: [], spec }) as R;
const look = officeLook("Acme", [
  rule("color.primary", "color", "#6d4aff"),
  rule("color.ink", "color", "#1a1a2e"),
  rule("color.paper", "color", "#fdfcf8"),
  rule("type.heading", "font", { family: "Acme Serif" }, { fallback: "Georgia, serif" }),
  rule("type.body", "font", { family: "Inter" }, { fallback: "system-ui, sans-serif" }),
]);
const agency = officeLook("Agency", [rule("color.primary", "color", "#ff0000"), rule("type.heading", "font", { family: "Comic Sans MS" })]);

const enc = new TextEncoder();
const dec = new TextDecoder();
const LOGO = new Uint8Array([1, 2, 3]);
/** A designer's deck: the agency's theme with a script face, a slide with a red box in Comic Sans and one in theme colors, and a logo. */
const deck = () => [
  { name: "[Content_Types].xml", data: enc.encode("<Types/>") },
  { name: "ppt/theme/theme1.xml", data: enc.encode(themeXml(agency).replace("<a:ea typeface=\"\"/>", '<a:ea typeface=""/><a:font script="Jpan" typeface="Yu Gothic"/>')) },
  {
    name: "ppt/slides/slide1.xml",
    data: enc.encode(
      '<p:sld><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill><a:latin typeface="Comic Sans MS"/><a:srgbClr val="6D4AFF"/><a:latin typeface="+mj-lt"/><a:schemeClr val="accent1"/><a:srgbClr val="ff0000"/></p:sld>',
    ),
  },
  { name: "ppt/media/image1.png", data: LOGO },
];

test("a template is an Office document or template, by its type or else its name", () => {
  assert.equal(templateKind({ mime: "application/vnd.openxmlformats-officedocument.presentationml.template", filename: "deck" }), "potx");
  assert.equal(templateKind({ mime: "application/octet-stream", filename: "Letter.DOTX" }), "dotx");
  assert.equal(templateKind({ mime: "application/zip", filename: "budget.xlsx" }), "xlsx");
  assert.equal(templateKind({ mime: "image/png", filename: "logo.png" }), null);
});

test("a theme part wears the release: colors and latin faces, script faces kept", () => {
  const xml = rethemeXml(dec.decode(deck()[1].data), look);
  assert.match(xml, /<a:accent1><a:srgbClr val="6D4AFF"\/>/);
  assert.ok(!xml.includes("FF0000"));
  assert.match(xml, /<a:majorFont><a:latin typeface="Acme Serif"/);
  assert.match(xml, /<a:minorFont><a:latin typeface="Inter"/);
  assert.match(xml, /<a:font script="Jpan" typeface="Yu Gothic"\/>/);
});

test("retheme changes the themes and the swapped images, nothing else", () => {
  const before = deck();
  const fresh = new Uint8Array([9, 9]);
  const after = retheme(before, look, new Map([["ppt/media/image1.png", fresh]]));
  assert.deepEqual(after.map((p) => p.name), before.map((p) => p.name));
  assert.equal(after[0].data, before[0].data);
  assert.equal(after[2].data, before[2].data);
  assert.match(dec.decode(after[1].data), /6D4AFF/);
  assert.equal(after[3].data, fresh);
});

test("inspect counts hard-coded colors and faces that aren't the brand's, and hashes images", () => {
  const c = inspect(deck(), look);
  assert.equal(c.themes, 1);
  assert.deepEqual(c.colors, [{ value: "#FF0000", count: 2 }]);
  assert.deepEqual(c.fonts, [{ name: "Comic Sans MS", count: 1 }]);
  assert.deepEqual(c.images, [{ name: "ppt/media/image1.png", sha256: createHash("sha256").update(LOGO).digest("hex") }]);
  // A color of the brand's palette, if not one of the theme's twelve, is the brand's too.
  assert.deepEqual(inspect(deck(), look, ["#ff0000"]).colors, []);
});

test("the generated template passes its own check", async () => {
  const parts = await Promise.all(unzip(potx(look, null)).map(async (e) => ({ name: e.name, data: await e.read() })));
  const c = inspect(parts, look);
  assert.deepEqual([c.themes, c.fonts], [1, []]);
});
