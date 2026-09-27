import assert from "node:assert/strict";
import { test } from "node:test";
import { contrast, grade, hsl, inkOn, rgb } from "./color.ts";

test("hex reads as rgb, alpha ignored", () => {
  assert.deepEqual(rgb("#34a853"), [52, 168, 83]);
  assert.deepEqual(rgb("#ff000080"), [255, 0, 0]);
});

test("hsl matches the usual readouts", () => {
  assert.deepEqual(hsl([255, 0, 0]), [0, 100, 50]);
  assert.deepEqual(hsl([0, 0, 255]), [240, 100, 50]);
  assert.deepEqual(hsl([128, 128, 128]), [0, 0, 50]);
  assert.deepEqual(hsl([52, 168, 83]), [136, 53, 43]);
});

test("contrast follows WCAG 2", () => {
  assert.equal(contrast("#000000", "#ffffff"), 21);
  assert.equal(contrast("#ffffff", "#ffffff"), 1);
  assert.equal(contrast("#767676", "#ffffff").toFixed(2), "4.54");
  assert.equal(contrast("#ffffff", "#767676"), contrast("#767676", "#ffffff"), "order does not matter");
});

test("grades and ink", () => {
  assert.equal(grade(21), "AAA");
  assert.equal(grade(4.54), "AA");
  assert.equal(grade(3.2), "AA large");
  assert.equal(grade(2.9), "fail");
  assert.equal(inkOn("#ffff00"), "#000000");
  assert.equal(inkOn("#1f2937"), "#ffffff");
});
