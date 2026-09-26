import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { extractMetadata } from "./metadata.ts";
import { buildXmp, embedXmp } from "./xmp.ts";

const meta = {
  title: "Fox & friends <v2>",
  description: "Autumn hero",
  creator: "Ada",
  copyright: "(c) Acme",
  tags: ["mascot", "new york"],
};

const image = () => sharp({ create: { width: 8, height: 8, channels: 3, background: "#e76" } });

async function roundTrip(bytes: Buffer, mime: string) {
  const out = embedXmp(bytes, mime, buildXmp(meta));
  assert.ok(out, "embedded");
  // Pixels are untouched: only metadata was spliced in.
  assert.deepEqual(await sharp(out).raw().toBuffer(), await sharp(bytes).raw().toBuffer());
  return out;
}

test("JPEG: written metadata reads back, EXIF survives", async () => {
  const bytes = await image().jpeg().withExif({ IFD0: { Make: "Canon" } }).toBuffer();
  const m = extractMetadata(await roundTrip(bytes, "image/jpeg"));
  assert.equal(m?.title, meta.title);
  assert.equal(m?.description, meta.description);
  assert.equal(m?.creator, meta.creator);
  assert.equal(m?.copyright, meta.copyright);
  assert.deepEqual(m?.keywords, meta.tags);
  assert.equal(m?.camera, "Canon");
});

test("JPEG: an existing XMP packet is replaced, not duplicated", async () => {
  const once = await roundTrip(await image().jpeg().toBuffer(), "image/jpeg");
  const twice = embedXmp(once, "image/jpeg", buildXmp({ ...meta, title: "Second" }))!;
  assert.equal(extractMetadata(twice)?.title, "Second");
  assert.equal(twice.toString("latin1").split("http://ns.adobe.com/xap/1.0/\0").length, 2);
});

test("PNG: written metadata reads back", async () => {
  const m = extractMetadata(await roundTrip(await image().png().toBuffer(), "image/png"));
  assert.equal(m?.title, meta.title);
  assert.deepEqual(m?.keywords, meta.tags);
});

test("unsupported or malformed input is declined, not mangled", () => {
  assert.equal(embedXmp(Buffer.from("GIF89a"), "image/gif", buildXmp(meta)), null);
  assert.equal(embedXmp(Buffer.from("nope"), "image/jpeg", buildXmp(meta)), null);
});
