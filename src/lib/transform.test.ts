import assert from "node:assert/strict";
import { test } from "node:test";
import { drawScale, effective, MAX_DIMENSION, parseTransform, PRESETS, renditionLabel, serializeTransform, SHOWN_MAX, shownSize, SIZES } from "./transform.ts";

test("parses a simple transform", () => {
  assert.deepEqual(parseTransform("w_800,f_webp"), { w: 800, f: "webp" });
});

test("parses every supported key", () => {
  assert.deepEqual(parseTransform("w_1200,h_630,fit_cover,q_80,f_jpeg"), {
    w: 1200,
    h: 630,
    fit: "cover",
    q: 80,
    f: "jpeg",
  });
});

test("canonical form is order-independent", () => {
  const a = serializeTransform(parseTransform("f_webp,w_800")!);
  const b = serializeTransform(parseTransform("w_800,f_webp")!);
  assert.equal(a, b);
  assert.equal(a, "w_800,f_webp");
});

test("rejects malformed input", () => {
  for (const bad of [
    "",
    "w_",
    "_800",
    "w800",
    "zzz_1",
    "w_800,w_900", // duplicate key
    "f_gif", // unsupported format
    "fit_squish", // unsupported fit
    "q_0",
    "q_101",
    "w_0",
    "w_-1",
    "w_1.5",
    `w_${MAX_DIMENSION + 1}`,
    "w_" + "9".repeat(40), // overflow attempt
    "w_800,".repeat(40), // length cap
  ]) {
    assert.equal(parseTransform(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test("caps dimensions at the boundary, inclusive", () => {
  assert.deepEqual(parseTransform(`w_${MAX_DIMENSION}`), { w: MAX_DIMENSION });
});

test("values snap to a few steps, so a URL can't ask for a new rendition every time", () => {
  assert.deepEqual(parseTransform("w_801,h_1,q_82,f_webp"), { w: 828, h: 16, q: 80, f: "webp" });
  assert.deepEqual(parseTransform("w_7681"), { w: MAX_DIMENSION });
  assert.deepEqual(parseTransform("q_1"), { q: 5 });
  // Fit only means something with both sides.
  assert.deepEqual(parseTransform("w_800,fit_fill"), { w: 800 });
  assert.equal(serializeTransform(parseTransform("w_799,fit_cover,q_84")!), serializeTransform(parseTransform("w_800,q_85")!));
  const distinct = new Set<string>();
  for (let w = 1; w <= MAX_DIMENSION; w++) distinct.add(serializeTransform(parseTransform(`w_${w}`)!));
  assert.equal(distinct.size, SIZES.length);
  // Every preset, and what the app asks for itself, is already a step.
  for (const p of PRESETS) assert.equal(serializeTransform(parseTransform(p.spec)!), p.spec);
  for (const w of [40, 56, 64, 80, 112, 160, 192, 240, 260, 320, 400, 480, 520, 640, 800, 1280, 1600, 1920, 2400, 3200, 3840])
    assert.equal(parseTransform(`w_${w}`)!.w, w);
});

test("a side that can't bind drops, so equal pixels share a rendition", () => {
  const photo = { width: 3000, height: 2000, mime: "image/jpeg" };
  assert.deepEqual(effective({ w: 8000, f: "webp" }, photo), { f: "webp" });
  assert.deepEqual(effective({ w: 800, h: 8000, fit: "inside" }, photo), { w: 800, fit: "inside" });
  assert.deepEqual(effective({ w: 2500 }, photo), { w: 2500 }); // could bind if EXIF turns it
  assert.deepEqual(effective({ w: 8000, h: 8000, fit: "cover" }, photo), { w: 8000, h: 8000, fit: "cover" });
  assert.deepEqual(effective({ w: 8000 }, { width: null, height: null, mime: "image/jpeg" }), { w: 8000 });
});

test("outputSize says what a spec gives, never enlarged", async () => {
  const { outputSize } = await import("./transform.ts");
  const photo = { width: 4000, height: 3000, mime: "image/jpeg" };
  assert.deepEqual(outputSize({ w: 1200, f: "webp" }, photo), { width: 1200, height: 900, capped: false });
  assert.deepEqual(outputSize({ w: 1200, h: 630, fit: "cover" }, photo), { width: 1200, height: 630, capped: false });
  assert.deepEqual(outputSize({ f: "png" }, photo), { width: 4000, height: 3000, capped: false });
  // Large on a small image: the image at its own size.
  assert.deepEqual(outputSize({ w: 2400 }, { width: 1000, height: 500, mime: "image/png" }), { width: 1000, height: 500, capped: true });
  assert.deepEqual(outputSize({ w: 1200, h: 630, fit: "cover" }, { width: 1000, height: 1000, mime: "image/png" }), { width: 1000, height: 630, capped: true });
  // Orientation 6 turns it on its side before the width binds.
  assert.deepEqual(outputSize({ w: 1500 }, photo, 6), { width: 1500, height: 2000, capped: false });
  assert.equal(outputSize({ w: 100 }, { width: null, height: null, mime: "image/jpeg" }), null);
});

test("a vector is drawn at the size asked, so no side drops", () => {
  const icon = { width: 24, height: 24, mime: "image/svg+xml" };
  assert.deepEqual(effective({ w: 512, f: "png" }, icon), { w: 512, f: "png" });
  assert.deepEqual(effective({ w: 8000, h: 8000, fit: "inside" }, icon), { w: 8000, h: 8000, fit: "inside" });
  // The same size as a raster drops, and still renders at 24.
  assert.deepEqual(effective({ w: 512, f: "png" }, { ...icon, mime: "image/png" }), { f: "png" });
});

test("drawScale draws a vector big enough for the spec, within the cap", () => {
  const icon = { width: 24, height: 24, mime: "image/svg+xml" };
  assert.equal(drawScale({ w: 512 }, icon), 512 / 24);
  assert.equal(drawScale({ h: 256 }, icon), 256 / 24);
  assert.equal(drawScale({ f: "png" }, icon), 1);
  // Never smaller than its own size, and never for a raster.
  assert.equal(drawScale({ w: 16 }, icon), 1);
  assert.equal(drawScale({ w: 512 }, { ...icon, mime: "image/png" }), 1);
  // Inside binds on the tighter side; cover, outside and fill on the looser.
  const wide = { width: 40, height: 20, mime: "image/svg+xml" };
  assert.equal(drawScale({ w: 400, h: 400, fit: "inside" }, wide), 10);
  assert.equal(drawScale({ w: 400, h: 400 }, wide), 10);
  assert.equal(drawScale({ w: 400, h: 400, fit: "cover" }, wide), 20);
  assert.equal(drawScale({ w: 400, h: 400, fit: "outside" }, wide), 20);
  // The longest side stops at MAX_DIMENSION, however much a side asks.
  const tall = { width: 24, height: 480, mime: "image/svg+xml" };
  assert.equal(drawScale({ w: MAX_DIMENSION }, tall), MAX_DIMENSION / 480);
});

test("outputSize enlarges a vector, up to the cap", async () => {
  const { outputSize } = await import("./transform.ts");
  const icon = { width: 24, height: 24, mime: "image/svg+xml" };
  assert.deepEqual(outputSize({ w: 512, f: "png" }, icon), { width: 512, height: 512, capped: false });
  assert.deepEqual(outputSize({ w: 1200, h: 630, fit: "cover" }, icon), { width: 1200, height: 630, capped: false });
  assert.deepEqual(outputSize({ w: 1200, h: 630 }, icon), { width: 630, height: 630, capped: false });
  assert.deepEqual(outputSize({ f: "png" }, icon), { width: 24, height: 24, capped: false });
  // EXIF orientation means nothing to an SVG.
  assert.deepEqual(outputSize({ w: 100 }, { width: 20, height: 10, mime: "image/svg+xml" }, 6), { width: 100, height: 50, capped: false });
  // A tall icon asked for 8000 wide stops at 8000 tall.
  assert.deepEqual(outputSize({ w: MAX_DIMENSION }, { width: 24, height: 480, mime: "image/svg+xml" }), { width: 400, height: 8000, capped: true });
});

test("a rendition reads as its preset's name, else its spec", () => {
  assert.equal(renditionLabel(null), "Original");
  assert.equal(renditionLabel("w_1200,f_webp"), "Web");
  assert.equal(renditionLabel("w_512,f_png"), "w_512,f_png");
});

test("a file shown, not handed out, is drawn at a preview's size at most", () => {
  assert.deepEqual(shownSize(parseTransform("w_800,f_webp")!), { w: 800, h: SHOWN_MAX, f: "webp" });
  assert.deepEqual(shownSize(parseTransform("w_4000,q_85,f_jpeg")!), { w: SHOWN_MAX, h: SHOWN_MAX, q: 85, f: "jpeg" });
  assert.deepEqual(shownSize(parseTransform("f_png")!), { w: SHOWN_MAX, h: SHOWN_MAX, f: "png" });
  assert.deepEqual(shownSize(parseTransform("w_1080,h_1920,fit_cover")!), { w: 1080, h: SHOWN_MAX, fit: "cover" });
});
