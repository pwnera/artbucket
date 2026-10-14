import assert from "node:assert/strict";
import { test } from "node:test";
import { fileTypeBadge, formatBytes, MAX_UPLOAD_BYTES, tooLargeToUpload, truncateFilename } from "./filename.ts";

test("short names are left alone", () => {
  assert.equal(truncateFilename("hero.png"), "hero.png");
});

test("the extension always survives", () => {
  const out = truncateFilename("fox_turnaround_v3_final_approved.psd");
  assert.ok(out.endsWith(".psd"), out);
  assert.ok(out.length <= 24, out);
  assert.ok(out.includes("…"));
});

test("truncates the stem from the middle, keeping both ends", () => {
  const out = truncateFilename("abcdefghijklmnopqrstuvwxyz.png", 16);
  assert.ok(out.startsWith("abcde"), out);
  assert.ok(out.endsWith(".png"), out);
});

test("handles names with no extension", () => {
  const out = truncateFilename("a".repeat(40), 12);
  assert.ok(out.length <= 12, out);
});

test("a dot-file is not mistaken for an extension", () => {
  assert.equal(truncateFilename(".gitignore", 24), ".gitignore");
});

test("a long trailing dot-segment is not treated as an extension", () => {
  const out = truncateFilename("report.2026.final.verylongextension", 20);
  assert.ok(out.length <= 20, out);
});

test("badge prefers the extension, falls back to the mime subtype", () => {
  assert.equal(fileTypeBadge("a.psd", "image/vnd.adobe.photoshop"), "PSD");
  assert.equal(fileTypeBadge("noext", "image/png"), "PNG");
  assert.equal(fileTypeBadge("hamster.lottie", "application/octet-stream"), "LOTTIE");
  assert.equal(fileTypeBadge("Hamster (dotLottie)", "application/octet-stream"), "FILE");
  assert.equal(fileTypeBadge("noext", "application/x-sketch"), "SKETCH");
  assert.equal(fileTypeBadge("Brand Kit v2.0", "text/uri-list"), "LINK");
  assert.equal(fileTypeBadge("Q3 deck", "text/uri-list", { service: "Slides" }), "SLIDES");
});

test("byte formatting", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(20135), "19.7 KB");
  assert.equal(formatBytes(5 * 1024 * 1024), "5.0 MB");
  assert.equal(formatBytes(13_002_342), "12.4 MB"); // the scale's own sample
  assert.equal(formatBytes(700 * 1024), "700 KB"); // no decimal past 100
});

test("truncating never splits an emoji in two", () => {
  const out = truncateFilename("😀".repeat(20) + ".png", 12);
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(out), out);
  assert.equal([...out].length, 12, out);
});

test("a Content-Disposition any browser reads back, whatever the name", async () => {
  const { disposition } = await import("./filename.ts");
  // RFC 5987 allows no ' ( ) * in the value: Chrome drops a filename* with a third quote.
  assert.equal(
    disposition("attachment", "Brand's logo (2)*.png"),
    `attachment; filename="Brand's logo (2)*.png"; filename*=UTF-8''Brand%27s%20logo%20%282%29%2A.png`,
  );
  assert.equal(disposition("inline", 'a"\r\nSet-Cookie: x.png'), `inline; filename="a___Set-Cookie: x.png"; filename*=UTF-8''a%22%0D%0ASet-Cookie%3A%20x.png`);
  // Past ASCII, the fallback is underscores and filename* has the name.
  assert.equal(disposition("attachment", "Café \\ 夏.jpg"), `attachment; filename="Caf_ _ _.jpg"; filename*=UTF-8''Caf%C3%A9%20%5C%20%E5%A4%8F.jpg`);
});

test("a file is saved as the asset's name, with the extension of its bytes", async () => {
  const { linkName, savedName } = await import("./filename.ts");
  const hero = { filename: "IMG_2034.JPG", metadata: { title: "Summer hero" } };
  assert.equal(savedName(hero), "Summer hero.JPG");
  assert.equal(savedName(hero, "webp"), "Summer hero.webp");
  assert.equal(savedName({ filename: "logo.svg" }), "logo.svg");
  assert.equal(savedName({ filename: "logo.svg" }, "png"), "logo.png");
  // A title that already ends in the extension doesn't get it twice; one with a dot of its own keeps it.
  assert.equal(savedName({ filename: "a.png", metadata: { title: "hero.png" } }), "hero.png");
  assert.equal(savedName({ filename: "a.png", metadata: { title: "Logo v1.2" } }), "Logo v1.2.png");
  assert.equal(savedName({ filename: "README" }), "README");

  assert.equal(linkName(hero), "summer-hero.jpg");
  assert.equal(linkName(hero, "webp"), "summer-hero.webp");
  assert.equal(linkName({ filename: "a.png", metadata: { title: "Crème brûlée’s menu, 2026!" } }), "creme-brulees-menu-2026.png");
  assert.equal(linkName({ filename: "a.png", metadata: { title: "x".repeat(59) + " y" } }), `${"x".repeat(59)}.png`);
  assert.equal(linkName({ filename: "夏.png" }), null);
  assert.equal(linkName({ filename: "README" }), null);
});

test("an upload past the limit says so in MB or GB, not bytes", () => {
  assert.equal(tooLargeToUpload(MAX_UPLOAD_BYTES), null);
  assert.equal(tooLargeToUpload(1.2 * 1024 ** 3), "Files up to 512 MB; this one is 1.2 GB");
});
