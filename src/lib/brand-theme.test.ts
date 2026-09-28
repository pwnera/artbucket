import assert from "node:assert/strict";
import { test } from "node:test";
import { brandTheme, stack } from "./brand-theme.ts";
import { contrast } from "./color.ts";
import type { Rule } from "./rules.ts";

let n = 0;
const r = (key: string, type: Rule["type"], value: Rule["value"], extra: Partial<Rule> = {}) =>
  ({ key, type, value, context: null, assets: [], id: String(++n), usage: null, ...extra }) as Rule;

test("the accent is the primary, lifted to read on both app backgrounds", () => {
  const t = brandTheme([r("color.background", "color", "#ffffff"), r("color.primary", "color", "#ffd400")]);
  assert.ok(t.accent);
  assert.ok(contrast(t.accent.light, "#ffffff") >= 3, "yellow is lifted on white");
  assert.ok(contrast(t.accent.dark, "#111111") >= 3);
  // Already readable on dark: left as it is.
  assert.equal(t.accent.dark, "#ffd400");
});

test("without a primary, brand, then accent, then the first color", () => {
  assert.equal(brandTheme([r("color.ink", "color", "#101010"), r("color.accent", "color", "#e87d0d")]).accent?.dark, "#e87d0d");
  assert.equal(brandTheme([r("color.sky", "color", "#3b82f6")]).accent?.dark, "#3b82f6");
  assert.equal(brandTheme([r("color.sky", "color", "not a color")]).accent, undefined);
});

test("faces: a heading rule for headings, a body rule for text, one face for both otherwise", () => {
  const two = brandTheme([
    r("type.primary", "font", { family: "Inter", weight: 400 }),
    r("type.heading", "font", { family: "Space Grotesk", weight: 700 }),
  ]);
  assert.deepEqual(two.head, { family: "Space Grotesk", weight: 700 });
  assert.deepEqual(two.body, { family: "Inter", weight: 400 });
  const one = brandTheme([r("type.face", "font", "Inter")]);
  assert.deepEqual(one.head, { family: "Inter" });
  assert.deepEqual(one.body, one.head);
  assert.deepEqual(brandTheme([]), {});
});

test("a face carries its font file, not its other assets", () => {
  const t = brandTheme([
    r("type.heading", "font", "Brand Sans", {
      assets: [
        { id: "img", rendition: null, mime: "image/png", filename: "specimen.png" },
        { id: "woff", rendition: null, mime: "font/woff2", filename: "BrandSans-Bold.woff2" },
      ],
    }),
  ]);
  assert.equal(t.head?.file, "woff");
});

test("context variants don't change the page's look", () => {
  const t = brandTheme([r("color.primary", "color", "#e87d0d"), r("color.primary", "color", "#000000", { context: "print" })]);
  assert.equal(t.accent?.dark, "#e87d0d");
});

test("the stack falls back to the name, then the app's face", () => {
  assert.equal(stack({ family: "Inter" }, "ab-font-1"), `"ab-font-1", "Inter", var(--font-sans), sans-serif`);
  assert.equal(stack({ family: "Inter" }, null), `"Inter", var(--font-sans), sans-serif`);
});
