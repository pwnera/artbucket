import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateSync } from "node:zlib";
import { signUp } from "@/test/db";
import { ingestBytes } from "@/lib/core/assets";
import { createBrand, createRule, publishBrand } from "@/lib/core/brand";
import { brandTemplateFile, brandTemplates } from "@/lib/core/office-templates";
import { officeLook, themeXml } from "@/lib/office";
import { crc32, unzip, zip } from "@/lib/zip";

const ada = await signUp("Templa");
const enc = new TextEncoder();
const dec = new TextDecoder();

/** A plain PNG of that size: a different size is a different file. */
function png(width: number, height: number) {
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
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.alloc((width * 3 + 1) * height))), chunk("IEND", new Uint8Array())]);
}

const v1 = png(8, 2);
const logo = (await ingestBytes(ada.caller, { bytes: v1, mime: "image/png", filename: "logo.png" })).asset;
// An agency's deck: its own theme, a red box, and the logo as it was.
const agency = officeLook("Agency", [{ key: "color.primary", type: "color", value: "#ff0000", context: null, assets: [], spec: null }]);
const deckBytes = zip([
  { name: "[Content_Types].xml", data: enc.encode("<Types/>") },
  { name: "ppt/theme/theme1.xml", data: enc.encode(themeXml(agency)) },
  { name: "ppt/slides/slide1.xml", data: enc.encode('<p:sld><a:srgbClr val="FF0000"/><a:schemeClr val="accent1"/></p:sld>') },
  { name: "ppt/media/image1.png", data: v1 },
]);
const deck = (
  await ingestBytes(ada.caller, { bytes: Buffer.from(deckBytes), mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", filename: "Pitch deck.pptx" })
).asset;
await createBrand(ada.caller, { name: "Acme", slug: "acme" });
await createRule(ada.caller, "acme", { key: "color.primary", type: "color", value: "#6d4aff" });
await createRule(ada.caller, "acme", { key: "logo.primary", type: "text", value: "The logo", assets: [{ id: logo.id, rendition: null }] });
await createRule(ada.caller, "acme", { key: "templates.slides", type: "text", value: "Start every deck from this one", assets: [{ id: deck.id, rendition: null }] });
const release = (await publishBrand(ada.caller, "acme")).number;

test("a release lists the Office files on its rules, each with what won't follow the brand", async () => {
  const [t, ...rest] = await brandTemplates(ada.caller, "acme", "live");
  assert.equal(rest.length, 0, "the logo is no template");
  assert.deepEqual([t.id, t.kind, t.app, t.error, t.themes], [deck.id, "pptx", "PowerPoint", null, 1]);
  assert.deepEqual(t.colors, [{ value: "#FF0000", count: 1 }]);
  assert.deepEqual(t.images, { total: 1, library: 1, updated: 0 });
  assert.equal(t.follows, false);
});

test("a download wears the release, and the logo's newer version takes the old one's place", async () => {
  const v2 = png(16, 4);
  await ingestBytes(ada.caller, { bytes: v2, mime: "image/png", filename: "logo.png", versionOf: logo.id });
  assert.deepEqual((await brandTemplates(ada.caller, "acme", "live"))[0].images, { total: 1, library: 1, updated: 1 });

  const t = await brandTemplateFile(ada.caller, "acme", "live", deck.id);
  assert.equal(t.filename, `Pitch deck-v${release}.pptx`);
  assert.equal(t.mime, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  const parts = new Map(await Promise.all(unzip(t.bytes).map(async (e) => [e.name, await e.read()] as const)));
  assert.match(dec.decode(parts.get("ppt/theme/theme1.xml")), /<a:accent1><a:srgbClr val="6D4AFF"\/>/);
  assert.deepEqual(Buffer.from(parts.get("ppt/media/image1.png")!), v2);
  // What the designer wrote stays as written.
  assert.match(dec.decode(parts.get("ppt/slides/slide1.xml")), /FF0000/);
  // The same release and files: the same bytes.
  assert.equal((await brandTemplateFile(ada.caller, "acme", release, deck.id)).etag, t.etag);
});

test("only a release's template is served", async () => {
  await assert.rejects(brandTemplateFile(ada.caller, "acme", "live", logo.id), /isn't one of this release's templates/);
  await assert.rejects(brandTemplates(ada.caller, "acme", 99), /Version 99 was never released/);
});
