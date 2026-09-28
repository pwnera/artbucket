import assert from "node:assert/strict";
import { test } from "node:test";
import { brandTheme, colorsOf, fontRoles, renameThemeKey, stack, ThemeSettings } from "./brand-theme.ts";
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

test("a face's file is the one for its weight, not the first listed", () => {
  const font = (id: string, filename: string) => ({ id, rendition: null, mime: "font/ttf", filename });
  const assets = [font("thin", "Inter-Thin.ttf"), font("italic", "Inter-Italic.ttf"), font("regular", "Inter-Regular.ttf"), font("bold", "Inter-Bold.ttf")];
  assert.equal(brandTheme([r("type.body", "font", "Inter", { assets })]).body?.file, "regular");
  assert.equal(brandTheme([r("type.body", "font", { family: "Inter", weight: 700 }, { assets })]).body?.file, "bold");
});

test("context variants don't change the page's look", () => {
  const t = brandTheme([r("color.primary", "color", "#e87d0d"), r("color.primary", "color", "#000000", { context: "print" })]);
  assert.equal(t.accent?.dark, "#e87d0d");
});

test("the stack falls back to the name, then the app's face", () => {
  assert.equal(stack({ family: "Inter" }, "ab-font-1"), `"ab-font-1", "Inter", var(--font-sans), sans-serif`);
  assert.equal(stack({ family: "Inter" }, null), `"Inter", var(--font-sans), sans-serif`);
});

test("theme settings are strict, and name rules by key", () => {
  const ok = { accent: "color.primary", head: null, device: "7f1c3c3e-4c3a-4d8e-9a8b-2f3f4a5b6c7d", radius: 8, width: "wide", scale: 1.333, band: true };
  assert.deepEqual(ThemeSettings.parse(ok), ok);
  assert.deepEqual(ThemeSettings.parse({}), {});
  assert.ok(!ThemeSettings.safeParse({ acent: "color.primary" }).success, "a misspelled setting is refused");
  assert.ok(!ThemeSettings.safeParse({ accent: "Color Primary" }).success);
  assert.ok(!ThemeSettings.safeParse({ radius: 41 }).success);
  assert.ok(!ThemeSettings.safeParse({ device: "logo.svg" }).success);
});

test("fontRoles: the setting, then the role, then the name, then the first font", () => {
  const spec = (role: string) => ({ spec: { role } }) as Partial<Rule>;
  const rules = [
    r("type.heading", "font", "Named Head"),
    r("type.body", "font", "Named Body"),
    r("type.feature", "font", "Role Head", spec("headline")),
    r("type.reading", "font", "Role Body", spec("body")),
    r("type.eyebrow", "font", "Role Label", spec("label")),
    r("type.picked", "font", "Picked"),
    r("color.head", "color", "#000000"),
  ];
  const family = (x: { head?: Rule; body?: Rule; label?: Rule }) =>
    [x.head, x.body, x.label].map((f) => f && (f.value as string));
  assert.deepEqual(family(fontRoles(rules, { head: "type.picked", body: "type.picked", label: "type.picked" })), ["Picked", "Picked", "Picked"]);
  assert.deepEqual(family(fontRoles(rules)), ["Role Head", "Role Body", "Role Label"]);
  const unroled = rules.map((x) => ({ ...x, spec: null }));
  assert.deepEqual(family(fontRoles(unroled)), ["Named Head", "Named Body", undefined], "no label without a setting or a role");
  assert.deepEqual(family(fontRoles(unroled.slice(5))), ["Picked", "Picked", undefined], "the first font, for both");
  // A setting naming a deleted rule, or a color, falls back as if unset.
  assert.deepEqual(family(fontRoles(rules, { head: "type.gone", body: "color.head" })), ["Role Head", "Role Body", "Role Label"]);
});

test("the page's faces: a role beats a name, and text is the first font when nothing names it", () => {
  const t = brandTheme([r("type.heading", "font", "Inter"), r("type.serif", "font", "Canela", { spec: { role: "display" } } as Partial<Rule>)]);
  assert.equal(t.head?.family, "Canela");
  assert.equal(t.body?.family, "Inter");
  const named = brandTheme([r("type.sans", "font", "Inter"), r("type.heading", "font", "Space Grotesk")]);
  assert.deepEqual([named.head?.family, named.body?.family], ["Space Grotesk", "Inter"]);
});

test("renameThemeKey renames every slot naming the rule, and says when none does", () => {
  const s: ThemeSettings = { accent: "color.brand", surface: "color.brand", head: "type.a", width: "normal", logo: "logo.main" };
  assert.deepEqual(renameThemeKey(s, "color.brand", "color.primary"), { ...s, accent: "color.primary", surface: "color.primary" });
  assert.deepEqual(renameThemeKey(s, "logo.main", "logo.primary"), { ...s, logo: "logo.primary" });
  assert.equal(renameThemeKey(s, "color.other", "color.x"), null);
  assert.equal(renameThemeKey({ width: "normal" }, "normal", "wide"), null, "enum values are not keys");
});

test("colorsOf: one color per key, the first variant, valid hex only", () => {
  const rules = [
    r("color.primary", "color", "#6d4aff"),
    r("type.body", "font", { family: "Inter" }),
    r("color.primary", "color", "#ffffff", { context: "dark-background" }),
    r("color.bad", "color", "blue"),
    r("color.ink", "color", "#10101080"),
  ];
  assert.deepEqual(colorsOf(rules).map((x) => x.value), ["#6d4aff", "#10101080"]);
});
