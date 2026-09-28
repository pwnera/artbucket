import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { contrast, grade, hexOf, hsl, inkOn, isHex, lift, mix, rgb } from "./color.ts";

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

test("lift keeps a color that passes and moves one that does not", () => {
  assert.equal(lift("#6d4aff", "#ffffff"), "#6d4aff");
  assert.equal(lift("#6D4AFF", "#ffffff"), "#6d4aff", "normalized");
  assert.ok(contrast(lift("#111111", "#111111"), "#111111") >= 3, "black accent in dark");
  assert.ok(contrast(lift("#ffffff", "#ffffff"), "#ffffff") >= 3, "white accent in light");
  assert.ok(contrast(lift("#777777", "#111111", 4.5), "#111111") >= 4.5);
  // A mid ground reads with black: white on orange never clears 4.5, so lifting toward white would stop short.
  assert.ok(contrast(lift("#ffb070", "#e87d0d", 4.5), "#e87d0d") >= 4.5);
});

test("mix moves one color toward another", () => {
  assert.equal(mix("#ffffff", "#000000", 0), "#ffffff");
  assert.equal(mix("#ffffff", "#000000", 1), "#000000");
  assert.equal(mix("#ffffff", "#000000", 0.5), "#808080");
  assert.equal(mix("#FF0000", "#0000ff80", 0.25), "#bf0040", "alpha ignored, normalized");
});

test("status colors read as text on the background in both themes", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  // The theme blocks also carry the selectors that restore the app's tokens inside a brand site (.app-tokens, .light).
  const block = (sel: string) => css.slice(css.search(new RegExp(`^\\${sel[0]}${sel.slice(1)}[ ,]`, "m"))).split("}")[0];
  for (const [sel, bg] of [[":root", "#ffffff"], [".dark", "#111111"]]) {
    assert.ok(block(sel).includes(`--background: ${bg};`), `${sel} background`);
    for (const name of ["success", "warning"]) {
      const value = block(sel).match(new RegExp(`--${name}: (#[0-9a-f]{6});`))?.[1];
      assert.ok(value, `${sel} --${name}`);
      assert.ok(contrast(value, bg) >= 4.5, `${sel} --${name} ${value}`);
    }
  }
});

test("a hex as typed is the color it means, or nothing", () => {
  assert.equal(hexOf("6D4AFF"), "#6d4aff");
  assert.equal(hexOf(" #abc "), "#aabbcc");
  assert.equal(hexOf("#abcd"), "#aabbccdd");
  assert.equal(hexOf("#6d4aff80"), "#6d4aff80");
  assert.equal(hexOf("#6d4af"), null);
  assert.equal(hexOf("red"), null);
  assert.ok(isHex("#6D4AFF") && isHex("#6d4aff80"));
  assert.ok(!isHex("#abc") && !isHex("6d4aff") && !isHex("#6d4aff8"));
});
