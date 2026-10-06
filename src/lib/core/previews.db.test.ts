import assert from "node:assert/strict";
import { test } from "node:test";
import { writePsdBuffer } from "ag-psd";
import { previewOf } from "@/lib/core/previews";
import { ensureBucket } from "@/lib/storage";

await ensureBucket();

// A one-page PDF, 200 by 100 points, with a filled rectangle: mupdf mends the missing cross-reference table.
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]/Contents 4 0 R>>endobj\n" +
    "4 0 obj<</Length 26>>stream\n1 0 0 rg 10 10 180 80 re f\nendstream endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

test("a PDF's first page is drawn in a child process and stored", async () => {
  const probe = await previewOf(PDF, "application/pdf");
  assert.ok(probe.preview, "a still was stored");
});

test("a PSD's composite comes back with its size", async () => {
  const psd = writePsdBuffer({ width: 3, height: 2, imageData: { width: 3, height: 2, data: new Uint8ClampedArray(3 * 2 * 4).fill(200) } as ImageData });
  const probe = await previewOf(psd, "image/vnd.adobe.photoshop");
  assert.ok(probe.preview);
  assert.equal(probe.width, 3);
  assert.equal(probe.height, 2);
});

test("a file the decoder chokes on yields no preview, and the server goes on", async () => {
  const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(64, 7)]);
  assert.deepEqual(await previewOf(heic, "image/heic"), { previews: 1 });
  assert.deepEqual(await previewOf(Buffer.from("%PDF-1.4 nothing else"), "application/pdf"), { previews: 1 });
});
