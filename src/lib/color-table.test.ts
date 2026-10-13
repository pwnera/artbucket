import assert from "node:assert/strict";
import { test } from "node:test";
import { colorTable, darkContext } from "./color-table.ts";

const c = (key: string, value: string, group?: string, context: string | null = null) => ({
  key,
  type: "color" as const,
  value,
  context,
  spec: group ? { group } : null,
});

const rules = [
  c("color.paper", "#ffffff", "Palette"),
  c("color.paper", "#0f0e1c", "Palette", "dark-background"),
  c("color.panel", "#f5f4f8", "Palette"),
  c("color.ink", "#16152a", "Palette"),
  c("color.ink", "#f2f1f7", "Palette", "dark-background"),
  c("color.night", "#0f0e1c", "Night"),
  c("color.nightInk", "#f2f1f7", "Night"),
  c("color.accent", "#6d4aff", "Accent"),
  c("color.accentInk", "#ffffff", "Accent"),
  c("color.brand", "#ff5500"),
];

test("rows by group, light beside dark, contrast on text only", () => {
  const t = colorTable(rules, "dark-background");
  assert.deepEqual(
    t.map((g) => [g.group, g.rows.map((r) => r.key)]),
    [
      ["Palette", ["color.paper", "color.panel", "color.ink"]],
      ["Night", ["color.night", "color.nightInk"]],
      ["Accent", ["color.accent", "color.accentInk"]],
      ["", ["color.brand"]],
    ],
  );
  const [paper, panel, ink] = t[0].rows;
  assert.deepEqual(paper.dark, { hex: "#0f0e1c", own: true, ratio: null });
  assert.equal(panel.light.ratio, null);
  // Ink on paper in each theme: the dark ink on the dark paper.
  assert.equal(ink.light.ratio!.toFixed(1), "17.9");
  assert.equal(ink.dark.ratio!.toFixed(1), "17.0");
  // No dark version: the light value, inherited, on the group's own ground.
  const nightInk = t[1].rows[1];
  assert.deepEqual([nightInk.dark.hex, nightInk.dark.own], ["#f2f1f7", false]);
  assert.equal(nightInk.light.ratio!.toFixed(1), "17.0");
  // A group with no ground by name: its first color that isn't text.
  assert.equal(t[2].rows[1].light.ratio!.toFixed(1), "5.2");
  assert.equal(t[3].rows[0].light.ratio, null);
});

test("a color's pair is text on it", () => {
  const brand = { ...c("color.brand", "#ff5500"), spec: { pair: "color.onBrand" } };
  const [{ rows }] = colorTable([brand, c("color.onBrand", "#000000")], "dark-background");
  assert.equal(rows[0].light.ratio, null);
  assert.equal(rows[1].light.ratio!.toFixed(1), "6.6");
});

test("the brand's own dark context, else dark-background", () => {
  assert.equal(darkContext([null, "print", "dark"]), "dark");
  assert.equal(darkContext(["darkroom", "print"]), "dark-background");
});
