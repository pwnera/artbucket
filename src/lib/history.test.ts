import assert from "node:assert/strict";
import { test } from "node:test";
import { diffRules, extendsLatest, MERGE_WINDOW_MS, summarize, type SnapRule } from "./history.ts";

const rule = (key: string, over: Partial<SnapRule> = {}): SnapRule => ({
  key,
  context: null,
  type: "text",
  value: "x",
  usage: null,
  position: 0,
  assets: [],
  ...over,
});

test("added, removed and changed, field by field", () => {
  const before = [rule("color.primary", { type: "color", value: "#111111" }), rule("tone.voice"), rule("logo.gone")];
  const after = [
    rule("color.primary", { type: "color", value: "#222222", usage: "Buttons" }),
    rule("tone.voice"),
    rule("logo.new", { position: 1 }),
  ];
  const d = diffRules(before, after);
  assert.deepEqual(
    d.map((c) => [c.change, c.key]),
    [
      ["changed", "color.primary"],
      ["added", "logo.new"],
      ["removed", "logo.gone"],
    ],
  );
  const changed = d[0];
  assert.ok(changed.change === "changed");
  assert.deepEqual(changed.fields, [
    { field: "value", before: "#111111", after: "#222222" },
    { field: "usage", before: null, after: "Buttons" },
  ]);
  assert.equal(changed.moved, false);
});

test("a context version is its own rule", () => {
  const d = diffRules([rule("color.primary")], [rule("color.primary"), rule("color.primary", { context: "print" })]);
  assert.deepEqual(d.map((c) => [c.change, c.context]), [["added", "print"]]);
});

test("a reorder reads as moved; a shift from adding a rule does not", () => {
  const a = [rule("logo.a", { position: 0 }), rule("logo.b", { position: 1 })];
  const swapped = [rule("logo.a", { position: 1 }), rule("logo.b", { position: 0 })];
  assert.deepEqual(diffRules(a, swapped).map((c) => [c.change, c.key]), [
    ["moved", "logo.b"],
    ["moved", "logo.a"],
  ]);
  const shifted = [rule("logo.new", { position: 0 }), rule("logo.a", { position: 5 }), rule("logo.b", { position: 6 })];
  assert.deepEqual(diffRules(a, shifted).map((c) => c.change), ["added"]);
});

test("asset and rendition changes are changes", () => {
  const id = "6f1c2a4e-1b7d-4c3e-9a2b-0d4e5f6a7b8c";
  const d = diffRules(
    [rule("logo.file", { assets: [{ id, rendition: null }] })],
    [rule("logo.file", { assets: [{ id, rendition: "f_png" }] })],
  );
  assert.equal(d.length, 1);
  assert.ok(d[0].change === "changed" && d[0].fields[0].field === "assets");
});

test("identical sets have no diff", () => {
  assert.deepEqual(diffRules([rule("a.b")], [rule("a.b")]), []);
});

test("edits merge into the latest version only when it is a recent, unnamed edit by the same actor", () => {
  const now = new Date("2026-09-27T12:00:00Z");
  const recent = new Date(now.getTime() - 60_000);
  const edit = { kind: "edit" as const, name: null, actor: "web", updatedAt: recent };
  assert.equal(extendsLatest(edit, "web", now), true);
  assert.equal(extendsLatest(undefined, "web", now), false);
  assert.equal(extendsLatest({ ...edit, actor: "ci-bot" }, "web", now), false);
  assert.equal(extendsLatest({ ...edit, name: "Launch" }, "web", now), false);
  assert.equal(extendsLatest({ ...edit, kind: "restore" }, "web", now), false);
  assert.equal(extendsLatest({ ...edit, kind: "baseline" }, "web", now), false);
  assert.equal(extendsLatest({ ...edit, updatedAt: new Date(now.getTime() - MERGE_WINDOW_MS) }, "web", now), false);
});

test("summaries", () => {
  assert.equal(summarize([]), "No changes");
  assert.equal(summarize(["color.primary"]), "Edited color.primary");
  assert.equal(summarize(["color.primary", "tone.voice", "logo.size"]), "Edited color.primary and 2 more");
});
