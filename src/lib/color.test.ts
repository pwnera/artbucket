import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { APP_BG, contrast, grade, groundFor, hexOf, hsl, inkOn, isHex, lift, mix, rgb, tintOf, toCmyk, type Rgb } from "./color.ts";

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

test("every text token reads on every surface text sits on, in both themes", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  // The theme blocks also carry the selectors that restore the app's tokens inside a brand site (.app-tokens, .light).
  const block = (sel: string) => css.slice(css.search(new RegExp(`^\\${sel[0]}${sel.slice(1)}[ ,]`, "m"))).split("}")[0];
  const token = (sel: string, name: string) => {
    const value = block(sel).match(new RegExp(`--${name}: (#[0-9a-f]{6});`))?.[1];
    assert.ok(value, `${sel} --${name}`);
    return value;
  };
  // The sidebar's current item is the primary mixed into the sidebar, in sRGB as mix() is.
  const current = (sel: string) => {
    const pct = block(sel).match(/--sidebar-accent: color-mix\(in srgb, var\(--primary\) (\d+)%, var\(--sidebar\)\);/)?.[1];
    assert.ok(pct, `${sel} --sidebar-accent`);
    return mix(token(sel, "sidebar"), token(sel, "primary"), Number(pct) / 100);
  };
  for (const [sel, bg] of [[":root", APP_BG.light], [".dark", APP_BG.dark]]) {
    assert.equal(token(sel, "background"), bg, `${sel} --background is APP_BG`);
    const surfaces = { ...Object.fromEntries(["background", "card", "muted", "sidebar"].map((k) => [k, token(sel, k)])), "sidebar-accent": current(sel) };
    for (const [surface, s] of Object.entries(surfaces))
      for (const text of ["foreground", "muted-foreground", "primary-ink", "success", "warning"]) {
        const t = token(sel, text);
        assert.ok(contrast(t, s) >= 4.5, `${sel} --${text} ${t} on --${surface} ${s}: ${contrast(t, s).toFixed(2)}`);
      }
    assert.ok(contrast(token(sel, "primary-foreground"), token(sel, "primary")) >= 4.5, `${sel} text on primary`);
    assert.ok(contrast(token(sel, "highlight-foreground"), token(sel, "highlight")) >= 4.5, `${sel} text on highlight`);
    assert.ok(contrast(token(sel, "ring"), bg) >= 3, `${sel} focus ring`);
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

test("tints are the color at a percent, the rest white", () => {
  assert.equal(tintOf("#e87d0d", 100), "#e87d0d");
  assert.equal(tintOf("#e87d0d", 0), "#ffffff");
  assert.equal(tintOf("#000000", 60), "#666666");
  assert.equal(tintOf("#E87D0D", 50), mix("#e87d0d", "#ffffff", 0.5), "normalized");
});

test("CMYK converted from RGB, in whole percents", () => {
  assert.deepEqual(toCmyk("#ff0000"), [0, 100, 100, 0]);
  assert.deepEqual(toCmyk("#000000"), [0, 0, 0, 100]);
  assert.deepEqual(toCmyk("#ffffff"), [0, 0, 0, 0]);
  assert.deepEqual(toCmyk("#808080"), [0, 0, 0, 50]);
  assert.deepEqual(toCmyk("#e87d0d"), [0, 46, 94, 9]);
  assert.deepEqual(toCmyk("#265787"), [72, 36, 0, 47]);
});

test("a card's ground keeps its wash for a dark mark and takes the palette for a white one", () => {
  const white: Rgb[] = Array(10).fill([255, 255, 255]);
  const black: Rgb[] = Array(10).fill([0, 0, 0]);
  assert.equal(groundFor(black, "#fde8e4", ["#4285f4"]), "#fde8e4");
  assert.equal(groundFor(white, "#fde8e4", ["#fbbc05", "#4285f4", "#000000"]), "#4285f4", "the first that reads, in order");
  assert.equal(groundFor(white, "#fde8e4", ["#fbbc05"]), "#111111", "none reads: ink");
  assert.equal(groundFor([], "#fde8e4", ["#4285f4"]), "#fde8e4", "no pixels: as is");
  const redMark: Rgb[] = [...Array(90).fill([255, 255, 255]), ...Array(10).fill([255, 54, 33])];
  assert.equal(groundFor(redMark, "#fde8e4", ["#ff3621", "#1b3139"]), "#1b3139", "not the red its mark is drawn in");
});
