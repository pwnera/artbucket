import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { extractMetadata } from "./metadata.ts";

const XMP = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title><rdf:Alt><rdf:li xml:lang="x-default">Fox hero</rdf:li></rdf:Alt></dc:title><dc:subject><rdf:Bag><rdf:li>Brand</rdf:li><rdf:li>New York</rdf:li></rdf:Bag></dc:subject><dc:creator><rdf:Seq><rdf:li>Ada</rdf:li></rdf:Seq></dc:creator></rdf:Description></rdf:RDF></x:xmpmeta>`;

const blank = () => sharp({ create: { width: 8, height: 8, channels: 3, background: "#f00" } }).jpeg();

test("flattens EXIF and XMP, XMP winning where both are set", async () => {
  const bytes = await blank()
    .withExif({
      IFD0: { Artist: "Bob", Copyright: "(c) Acme", ImageDescription: "A fox", Make: "Canon", Model: "EOS R5" },
      IFD2: { DateTimeOriginal: "2024:05:01 10:20:30" },
    })
    .withXmp(XMP)
    .toBuffer();

  assert.deepEqual(extractMetadata(bytes), {
    title: "Fox hero",
    description: "A fox",
    keywords: ["Brand", "New York"],
    creator: "Ada",
    copyright: "(c) Acme",
    capturedAt: "2024-05-01T10:20:30",
    camera: "Canon EOS R5",
  });
});

test("a file with nothing embedded yields null, not an empty object", async () => {
  assert.equal(extractMetadata(await blank().toBuffer()), null);
  assert.equal(extractMetadata(Buffer.from("not an image")), null);
});
