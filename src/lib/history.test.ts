import assert from "node:assert/strict";
import { test } from "node:test";
import { diffRules, extendsLatest, MERGE_WINDOW_MS, summarize, type SnapRule, updatesOf, whatsNew } from "./history.ts";
import type { Section, SnapPage } from "./pages.ts";

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

test("a label-only and a spec-only change are changes", () => {
  const color = (over: Partial<SnapRule> = {}) => rule("color.primary", { type: "color", value: "#e6007e", ...over });
  const label = diffRules([color()], [color({ label: "Pink" })]);
  assert.deepEqual(label, [
    {
      change: "changed",
      key: "color.primary",
      context: null,
      fields: [{ field: "label", before: null, after: "Pink" }],
      moved: false,
    },
  ]);
  const spec = diffRules([color({ spec: { token: "Pink-500" } })], [color({ spec: { token: "Pink-600" } })]);
  assert.ok(spec[0].change === "changed");
  assert.deepEqual(spec[0].fields, [{ field: "spec", before: { token: "Pink-500" }, after: { token: "Pink-600" } }]);
});

test("a null label or spec is the same as none", () => {
  assert.deepEqual(diffRules([rule("a.b")], [rule("a.b", { label: null, spec: null })]), []);
  assert.deepEqual(diffRules([rule("a.b", { spec: null })], [rule("a.b")]), []);
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
  assert.equal(extendsLatest({ ...edit, publishedAt: now }, "web", now), false);
  assert.equal(extendsLatest({ ...edit, kind: "restore" }, "web", now), false);
  assert.equal(extendsLatest({ ...edit, kind: "baseline" }, "web", now), false);
  assert.equal(extendsLatest({ ...edit, updatedAt: new Date(now.getTime() - MERGE_WINDOW_MS) }, "web", now), false);
});

test("summaries", () => {
  assert.equal(summarize([]), "No changes");
  assert.equal(summarize(["color.primary"]), "Edited color.primary");
  assert.equal(summarize(["color.primary", "tone.voice", "logo.size"]), "Edited color.primary and 2 more");
  assert.equal(summarize(["page:logo"]), "Edited the logo page");
  assert.equal(summarize(["theme", "color.primary"]), "Edited the theme and 1 more");
});

// ---- what's new ---------------------------------------------------------------

const section = (id: string, more: Partial<Section> = {}): Section => ({
  id,
  template: "text",
  title: id,
  body: "",
  width: "text",
  columns: 1,
  tone: "plain",
  hidden: false,
  keys: [],
  props: {},
  ...more,
});
const page = (slug: string, more: Partial<SnapPage> = {}): SnapPage => ({ slug, title: slug, position: 0, hidden: false, sections: [section("a")], ...more });
const refs = (xs: { slug: string }[]) => xs.map((x) => x.slug);

test("whatsNew: rules by key, whatever the context; a reorder is no news", () => {
  const before = { rules: [rule("color.primary", { value: "#111111" }), rule("tone.voice"), rule("logo.gone"), rule("a.one", { position: 0 }), rule("a.two", { position: 1 })], pages: null };
  const after = {
    rules: [
      rule("color.primary", { value: "#111111" }),
      rule("color.primary", { context: "print", value: "#000000" }),
      rule("tone.voice", { label: "Voice" }),
      rule("logo.new"),
      rule("a.one", { position: 1 }),
      rule("a.two", { position: 0 }),
    ],
    pages: null,
  };
  assert.deepEqual(whatsNew(before, after).rules, { added: ["logo.new"], changed: ["color.primary", "tone.voice"], removed: ["logo.gone"] });
  assert.deepEqual(whatsNew(null, after).rules.added, ["color.primary", "tone.voice", "logo.new", "a.one", "a.two"]);
});

test("whatsNew: pages readers can reach; hiding one reads as removed, showing it as added; moves and old slugs are no news", () => {
  const before = {
    rules: [],
    pages: [page("logo"), page("color"), page("wip", { hidden: true }), page("wip-kid", { parent: "wip" }), page("old"), page("voice")],
  };
  const after = {
    rules: [],
    pages: [
      page("logo", { position: 3, parent: "brand", updatedAt: "2026-09-28T00:00:00.000Z" }),
      page("color", { hidden: true }),
      page("wip"),
      page("wip-kid", { parent: "wip", sections: [section("b")] }),
      page("renamed", { title: "old", aliases: ["old"] }),
      page("voice", { title: "Voice and tone", sections: [section("a"), section("draft", { hidden: true })] }),
      page("secret", { parent: "color" }),
    ],
  };
  const { pages } = whatsNew(before, after);
  assert.deepEqual(refs(pages.added), ["wip", "wip-kid"]);
  assert.deepEqual(pages.changed, [{ slug: "voice", title: "Voice and tone" }]);
  assert.deepEqual(refs(pages.removed), ["color"]);
  // A hidden section is not what a reader sees change.
  const draft = { rules: [], pages: [page("voice", { sections: [section("a"), section("draft", { hidden: true, body: "Later" })] })] };
  assert.deepEqual(whatsNew({ rules: [], pages: [page("voice", { sections: [section("a"), section("draft", { hidden: true })] })] }, draft).pages.changed, []);
});

test("updatesOf: each publish against the publish before it, newest first, across a restore", () => {
  const v = (number: number, rules: SnapRule[], published: boolean, more = {}) => ({
    number,
    rules,
    pages: null,
    publishedAt: published ? new Date(Date.UTC(2026, 8, number)) : null,
    publishedBy: published ? "web" : null,
    note: published ? `Release ${number}` : null,
    noteImage: null,
    ...more,
  });
  const one = [rule("color.primary")];
  const two = [rule("color.primary"), rule("logo.mark")];
  const three = [rule("color.primary", { value: "y" }), rule("tone.voice")];
  const versions = [
    v(1, one, true),
    v(2, two, true),
    v(3, three, false),
    // A restore of version 1, then a publish of it: readers saw version 2, so logo.mark is what went.
    v(4, one, false, { kind: "restore" }),
    v(5, one, true, { noteImage: "0b0e3c6a-5f6d-4c1e-9a53-7d1f6f2b8e01" }),
  ];
  const got = updatesOf(versions);
  assert.deepEqual(
    got.map((u) => [u.version, u.note, u.changes.rules]),
    [
      [5, "Release 5", { added: [], changed: [], removed: ["logo.mark"] }],
      [2, "Release 2", { added: ["logo.mark"], changed: [], removed: [] }],
      [1, "Release 1", { added: ["color.primary"], changed: [], removed: [] }],
    ],
  );
  assert.equal(got[0].publishedAt, "2026-09-05T00:00:00.000Z");
  assert.equal(got[0].image, "0b0e3c6a-5f6d-4c1e-9a53-7d1f6f2b8e01");
  // One more than the limit: the oldest listed still has what came before it.
  assert.deepEqual(updatesOf(versions.slice(1), 1)[0].changes.rules.removed, ["logo.mark"]);
});
