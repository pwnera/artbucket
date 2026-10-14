import assert from "node:assert/strict";
import { test } from "node:test";
import * as mupdf from "mupdf";
import { CutError, cutPage } from "./pdf-cut.ts";

/** A brand book's page: a tinted background, a caption, a logo (a disc in a stroked ring) and a second one beside it. */
function page() {
  const doc = new mupdf.PDFDocument();
  const font = doc.addSimpleFont(new mupdf.Font("Helvetica"));
  const res = doc.addObject({ Font: { F1: font } });
  const ring = (cx: number, cy: number, r: number) => {
    const k = 0.5523 * r;
    return `${cx + r} ${cy} m ${cx + r} ${cy + k} ${cx + k} ${cy + r} ${cx} ${cy + r} c ${cx - k} ${cy + r} ${cx - r} ${cy + k} ${cx - r} ${cy} c ${cx - r} ${cy - k} ${cx - k} ${cy - r} ${cx} ${cy - r} c ${cx + k} ${cy - r} ${cx + r} ${cy - k} ${cx + r} ${cy} c `;
  };
  // PDF space has y up: drawn in a top-left frame by flipping once.
  const ops = [
    "1 0 0 -1 0 600 cm",
    "q 0.95 0.95 0.93 rg 0 0 800 600 re f Q",
    "BT /F1 14 Tf 0 0 0 rg 1 0 0 -1 100 90 Tm (Logo) Tj ET",
    `q 0.96 0.55 0.13 rg ${ring(160, 170, 30)} f Q`,
    `q 0.14 0.13 0.42 RG 8 w ${ring(160, 170, 46)} S Q`,
    `q 0 0 0 rg ${ring(560, 170, 40)} f Q`,
  ].join(" ");
  doc.insertPage(-1, doc.addPage([0, 0, 800, 600], 0, res, ops));
  return Buffer.from(doc.saveToBuffer("compress").asUint8Array());
}

test("a logo cut from a page: its own vectors, its ring whole, without the page's background, caption or neighbour", async () => {
  // Around the first logo (110..210 x 120..220 of an 800x600 page), drawn a little loose, as a model reads it.
  const cut = await cutPage(page(), 1, [0.13, 0.19, 0.27, 0.38]);
  assert.equal(cut.svg, true);
  const svg = cut.bytes.toString();
  const [, w, h] = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)!.map(Number);
  // The ring's outer edge is 50 from its center: about 100 across, with a little air; nowhere near the page's 800.
  assert.ok(w > 98 && w < 112 && h > 98 && h < 112, `${w} x ${h}`);
  assert.equal((svg.match(/<path\b/g) ?? []).length, 2, "the disc and the ring, nothing else");
  assert.doesNotMatch(svg, /<image\b/);
});

test("an area with nothing drawn in it, or a page that isn't there, is refused", async () => {
  await assert.rejects(cutPage(page(), 1, [0.4, 0.6, 0.5, 0.7]), (e: unknown) => e instanceof CutError && e.code === "empty");
  await assert.rejects(cutPage(page(), 3, [0.1, 0.1, 0.2, 0.2]), (e: unknown) => e instanceof CutError && e.code === "page");
});
