import assert from "node:assert/strict";
import { test } from "node:test";
import { fileTypeBadge, formatBytes, truncateFilename } from "./filename.ts";

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
