import assert from "node:assert/strict";
import { test } from "node:test";
import {
  apply,
  applyAll,
  type BuilderState,
  duplicateItem,
  insertItems,
  moveItem,
  removeItem,
  echo,
  EMPTY,
  fieldOf,
  homeOf,
  invert,
  load,
  type NavEntry,
  type Op,
  pageOf,
  push,
  request,
  shownOn,
  travel,
} from "./builder-ops.ts";
import { canon, parseSections, type SectionInput } from "./pages.ts";
import type { PageView, ViewRule } from "./site.ts";

const sec = (s: SectionInput) => parseSections([s]).sections[0];
const rule = (key: string, type: ViewRule["type"], value: ViewRule["value"], more: Partial<ViewRule> = {}): ViewRule => ({
  key,
  context: null,
  type,
  label: null,
  value,
  usage: null,
  spec: null,
  assets: [],
  ...more,
});
const entry = (slug: string, position: number, more: Partial<NavEntry> = {}): NavEntry => ({
  slug,
  title: slug,
  position,
  hidden: false,
  parent: null,
  eyebrow: null,
  lede: null,
  cover: null,
  icon: null,
  audience: "everyone",
  tabs: false,
  layout: "book",
  aliases: [],
  updatedAt: null,
  keys: [],
  ...more,
});

/** Three pages, logo-use under logo and not loaded; four rule versions. */
function state(): BuilderState {
  return {
    nav: [entry("overview", 0, { keys: ["color.primary"] }), entry("logo", 1), entry("logo-use", 2, { parent: "logo", keys: ["logo.mark"] })],
    pages: new Map([
      ["overview", [sec({ id: "c1", template: "cover", title: "Blender" }), sec({ id: "p1", template: "palette", keys: ["color.primary"] })]],
      ["logo", [sec({ id: "t1", template: "text", title: "Mark" }), sec({ id: "t2", template: "text", body: "Room." })]],
    ]),
    rules: [
      rule("color.primary", "color", "#e87d0d"),
      rule("color.primary", "color", "#ffffff", { context: "dark-background" }),
      rule("tone.always", "list", ["Warm"]),
      rule("type.heading", "font", { family: "Inter" }),
    ],
    theme: { radius: 4 },
    selection: { page: "overview", section: null, rule: null },
    context: null,
    preview: false,
    lang: null,
    base: { brand: { slug: "blender", name: "Blender" }, version: null, lang: null, media: {}, collections: {}, signed: {} },
  };
}

const snap = (s: BuilderState, orderless = false) =>
  canon({ nav: s.nav, pages: [...s.pages].sort(), rules: orderless ? s.rules.map((r) => canon(r)).sort() : s.rules, theme: s.theme });

/** Apply `op`, then its inverse: back where it started. */
function roundTrip(s: BuilderState, op: Op, orderless = false) {
  const r = apply(s, op);
  assert.deepEqual(r.errors, []);
  assert.notEqual(snap(r.state), snap(s), "the op changed something");
  const back = apply(r.state, invert(r.op, s));
  assert.deepEqual(back.errors, []);
  assert.equal(snap(back.state, orderless), snap(s, orderless));
  return r;
}

const on = (page: string, op: unknown): Op => ({ kind: "page", page, op: op as Extract<Op, { kind: "page" }>["op"] });

test("apply and invert: section ops", () => {
  const s = state();
  const added = roundTrip(s, on("logo", { op: "add", section: { template: "text", title: "New" }, after: "t1" }));
  // The id it was given travels with the op, so the server keeps it.
  const id = (added.op as { op: { section: { id: string } } }).op.section.id;
  assert.deepEqual(
    added.state.pages.get("logo")!.map((x) => x.id),
    ["t1", id, "t2"],
  );
  roundTrip(s, on("logo", { op: "add", section: { template: "text" }, after: null }));
  roundTrip(s, on("logo", { op: "update", id: "t1", set: { title: "The mark", eyebrow: "01" } }));
  roundTrip(s, on("overview", { op: "update", id: "p1", set: { template: "chart", props: { kind: "line" } } }));
  roundTrip(s, on("logo", { op: "move", id: "t1", after: "t2" }));
  roundTrip(s, on("overview", { op: "move", id: "p1", after: null }));
  roundTrip(s, on("logo", { op: "remove", id: "t2" }));
  roundTrip(s, on("overview", { op: "remove", id: "c1" }));
});

test("apply and invert: page ops, pages made and deleted", () => {
  const s = state();
  roundTrip(s, on("logo", { op: "page", set: { title: "Logo", eyebrow: "02", layout: "landing", hidden: true } }));
  roundTrip(s, on("logo-use", { op: "page", set: { parent: null, position: 0 } }));
  const renamed = apply(s, on("logo", { op: "page", set: { slug: "mark" } }));
  const r = renamed.state;
  assert.deepEqual(
    r.nav.map((p) => [p.slug, p.parent, p.aliases]),
    [
      ["overview", null, []],
      ["mark", null, ["logo"]],
      ["logo-use", "mark", []],
    ],
  );
  assert.ok(r.pages.has("mark") && !r.pages.has("logo"));
  // Renamed back, as the server does it: the slug it had is its name again, and the one it leaves is an alias.
  const back = apply(r, invert(renamed.op, s)).state;
  assert.deepEqual(
    back.nav.map((p) => [p.slug, p.parent, p.aliases]),
    [
      ["overview", null, []],
      ["logo", null, ["mark"]],
      ["logo-use", "logo", []],
    ],
  );
  assert.equal(back.pages.get("logo"), s.pages.get("logo"));

  roundTrip(s, { kind: "add-page", page: { slug: "voice", title: "Voice", position: 1 }, sections: [sec({ template: "text", keys: ["tone.always"] })] });
  roundTrip(s, { kind: "delete-page", page: "overview" });
});

test("apply and invert: rules and theme", () => {
  const s = state();
  roundTrip(s, { kind: "rules", set: [rule("color.primary", "color", "#000000", { label: "Orange" })], remove: [] });
  roundTrip(s, { kind: "rules", set: [rule("tone.always", "list", ["Warm"], { context: "print" })], remove: [] });
  roundTrip(s, { kind: "rules", set: [rule("logo.clearSpace", "number", 2, { spec: { unit: "x" } })], remove: [] });
  // A version taken away comes back beside its key, as set_rules puts it.
  roundTrip(s, { kind: "rules", set: [], remove: [{ key: "color.primary", context: null }] }, true);
  roundTrip(s, { kind: "theme", set: { accent: "color.primary", radius: 8 } });
  roundTrip(s, { kind: "theme", set: { radius: null } });
});

test("a section can't show a rule its template doesn't: refused here, as the server would, before it is saved", () => {
  const s = state();
  const r = apply(s, on("overview", { op: "update", id: "p1", set: { template: "type" } }));
  assert.equal(r.state, s);
  assert.match(r.errors[0], /Type specimen section shows/);
});

test("a refused op changes nothing and says why", () => {
  const s = state();
  const refused: [Op, RegExp][] = [
    [on("logo", { op: "add", section: { template: "nope" } }), /template/],
    [on("logo", { op: "remove", id: "zz" }), /no section "zz"/],
    [on("logo-use", { op: "remove", id: "x" }), /isn't loaded/],
    [on("logo", { op: "page", set: { slug: "overview" } }), /exists/],
    [on("logo", { op: "page", set: { parent: "logo-use" } }), /loop/],
    [{ kind: "delete-page", page: "logo" }, /pages under it/],
    [{ kind: "delete-page", page: "logo-use" }, /isn't loaded/],
    [{ kind: "add-page", page: { slug: "Bad Slug", title: "X" }, sections: [] }, /slug/],
    [{ kind: "rules", set: [rule("color.primary", "text", "hi")], remove: [] }, /type can't change/],
    [{ kind: "rules", set: [rule("color.accent", "color", "orange")], remove: [] }, /set\[0\]/],
    [{ kind: "rules", set: [], remove: [{ key: "color.nope", context: null }] }, /no rule color.nope/],
    [{ kind: "theme", set: { radius: -3 } }, /radius/],
  ];
  for (const [op, why] of refused) {
    const r = apply(s, op);
    assert.equal(r.state, s);
    assert.match(r.errors.join("\n"), why);
  }
});

test("rule updates keep the objects of the rules they leave alone", () => {
  const s = state();
  const r = apply(s, { kind: "rules", set: [rule("color.primary", "color", "#000000")], remove: [] }).state;
  assert.equal(r.rules[0].value, "#000000");
  for (const i of [1, 2, 3]) assert.equal(r.rules[i], s.rules[i]);
  // And a section edit leaves the other sections as they were.
  const t = apply(s, on("logo", { op: "update", id: "t1", set: { title: "X" } })).state;
  assert.equal(t.pages.get("logo")![1], s.pages.get("logo")![1]);
  assert.equal(t.pages.get("overview"), s.pages.get("overview"));
});

test("typing coalesces into one step within a second", () => {
  let s = state();
  let h = EMPTY;
  const type = (title: string, at: number) => {
    const r = apply(s, on("logo", { op: "update", id: "t1", set: { title } }));
    h = push(h, r.op, invert(r.op, s), fieldOf(r.op, s), at);
    s = r.state;
  };
  type("M", 0);
  type("Ma", 400);
  type("Mar", 1300);
  assert.equal(h.past.length, 1, "each keystroke within a second of the last");
  type("Mark!", 2400);
  assert.equal(h.past.length, 2, "more than a second later");
  // Another field is another step.
  const r = apply(s, on("logo", { op: "update", id: "t1", set: { eyebrow: "01" } }));
  h = push(h, r.op, invert(r.op, s), fieldOf(r.op, s), 2500);
  s = r.state;
  assert.equal(h.past.length, 3);

  // One undo takes the whole run of typing back.
  let t = travel(s, h, true);
  t = travel(t.state, t.history, true);
  assert.equal(t.state.pages.get("logo")![0].title, "Mar");
  t = travel(t.state, t.history, true);
  assert.equal(t.state.pages.get("logo")![0].title, "Mark");
  assert.deepEqual(t.sent.length, 3);
  // A rule's value typed twice is one field too; its label is another.
  const c = s.rules[0];
  assert.equal(fieldOf({ kind: "rules", set: [{ ...c, value: "#000" }], remove: [] }, s), fieldOf({ kind: "rules", set: [{ ...c, value: "#0000" }], remove: [] }, s));
  assert.notEqual(fieldOf({ kind: "rules", set: [{ ...c, value: "#000" }], remove: [] }, s), fieldOf({ kind: "rules", set: [{ ...c, label: "A" }], remove: [] }, s));
  assert.equal(fieldOf(on("logo", { op: "remove", id: "t1" }), s), null);
});

test("undo works after the server's echo", () => {
  const s0 = state();
  const r = apply(s0, on("logo", { op: "update", id: "t1", set: { title: "The mark" } }));
  let h = push(EMPTY, r.op, invert(r.op, s0), fieldOf(r.op, s0), 0);
  const server = (s: BuilderState) => ({ ...s.nav[1], updatedAt: "2026-09-28T12:00:00.000Z", sections: JSON.parse(JSON.stringify(s.pages.get("logo"))) });

  // An echo of what the canvas shows keeps its objects.
  const quiet = echo(r.state, server(r.state));
  assert.equal(quiet.pages, r.state.pages);
  assert.equal(quiet.nav[1].updatedAt, "2026-09-28T12:00:00.000Z");

  // One that differs (someone else's edit) is taken, and undo still finds the section by id.
  const theirs = server(r.state);
  theirs.sections[1].body = "Their words.";
  const s2 = echo(r.state, theirs);
  assert.equal(s2.pages.get("logo")![0], r.state.pages.get("logo")![0]);
  let t = travel(s2, h, true);
  assert.deepEqual(t.errors, []);
  assert.equal(t.state.pages.get("logo")![0].title, "Mark");
  assert.equal(t.state.pages.get("logo")![1].body, "Their words.");
  t = travel(t.state, t.history, false);
  assert.equal(t.state.pages.get("logo")![0].title, "The mark");

  // A step that no longer applies drops the history rather than guess.
  h = push(EMPTY, r.op, invert(r.op, s0), null, 0);
  const gone = apply(r.state, on("logo", { op: "remove", id: "t1" })).state;
  const failed = travel(gone, h, true);
  assert.match(failed.errors.join(), /no section "t1"/);
  assert.equal(failed.history, EMPTY);
});

test("the selection follows renames and drops what is gone", () => {
  let s = state();
  s = { ...s, selection: { page: "logo", section: "t2", rule: null } };
  s = apply(s, on("logo", { op: "page", set: { slug: "mark" } })).state;
  assert.equal(s.selection.page, "mark");
  s = apply(s, on("mark", { op: "remove", id: "t2" })).state;
  assert.equal(s.selection.section, null);
  s = apply(s, on("logo-use", { op: "page", set: { parent: null } })).state;
  s = apply(s, { kind: "delete-page", page: "mark" }).state;
  assert.equal(s.selection.page, "overview");
});

test("requests: consecutive ops to one target go out together, in order", () => {
  const s = state();
  const c = s.rules[0];
  const pending: Op[] = [
    on("logo", { op: "update", id: "t1", set: { title: "A" } }),
    on("logo", { op: "move", id: "t1", after: "t2" }),
    on("overview", { op: "remove", id: "p1" }),
    { kind: "rules", set: [{ ...c, value: "#111111" }], remove: [] },
    { kind: "rules", set: [{ ...c, value: "#222222" }, rule("tone.always", "list", ["Kind"])], remove: [] },
    { kind: "rules", set: [], remove: [{ key: "tone.always", context: null }] },
    { kind: "theme", set: { accent: "color.primary" } },
    { kind: "theme", set: { radius: null } },
    { kind: "add-page", page: entry("voice", 3), sections: [] },
    { kind: "delete-page", page: "voice" },
  ];
  const sent = [];
  for (let rest = pending, r = request(rest, "blender"); r; rest = rest.slice(r.take), r = request(rest, "blender")) sent.push(r);
  assert.deepEqual(
    sent.map((r) => [r.method, r.url, r.take]),
    [
      ["PATCH", "/api/v1/brands/blender/pages/logo", 2],
      ["PATCH", "/api/v1/brands/blender/pages/overview", 1],
      ["PATCH", "/api/v1/brand/rules?brand=blender", 2],
      ["PATCH", "/api/v1/brand/rules?brand=blender", 1],
      ["PATCH", "/api/v1/brands/blender/theme", 2],
      ["PUT", "/api/v1/brands/blender/pages/voice", 1],
      ["DELETE", "/api/v1/brands/blender/pages/voice", 1],
    ],
  );
  assert.deepEqual((sent[0].body as { ops: unknown[] }).ops.length, 2);
  // A key's last version wins; text and list rules carry no spec.
  const rules = sent[2].body as { set: Record<string, unknown>[] };
  assert.deepEqual(
    rules.set.map((r) => [r.key, r.value, "spec" in r]),
    [
      ["color.primary", "#222222", true],
      ["tone.always", ["Kind"], false],
    ],
  );
  assert.deepEqual(sent[3].body, { set: [], remove: [{ key: "tone.always", context: null }] });
  assert.deepEqual(sent[4].body, { accent: "color.primary", radius: null });
  assert.deepEqual(Object.keys(sent[5].body as object).sort(), [
    "audience", "cover", "eyebrow", "hidden", "icon", "layout", "lede", "parent", "position", "sections", "tabs", "title", "translations",
  ]);
  assert.equal(request([], "blender"), null);
});

test("loading, the home, pages shown on, words in a language", () => {
  const s = state();
  assert.equal(homeOf(s.nav, s.pages), "overview");
  assert.equal(homeOf(s.nav, new Map()), null, "not loaded, not known");
  assert.deepEqual(shownOn(s, "color.primary"), ["overview"]);
  assert.deepEqual(shownOn(s, "logo.mark"), ["logo-use"], "an unloaded page by the keys listed");

  const view = { page: { slug: "logo-use", sections: [sec({ id: "d1", template: "text" })] }, media: { a: {} }, collections: {}, signed: { a: "sig" } } as unknown as PageView;
  const l = load(s, view);
  assert.deepEqual(l.pages.get("logo-use")!.map((x) => x.id), ["d1"]);
  assert.deepEqual(Object.keys(l.base.media), ["a"]);
  // A page edits already hold keeps them.
  assert.equal(load(l, { ...view, page: { ...view.page!, sections: [] } }).pages.get("logo-use")!.length, 1);

  const fr = sec({ id: "t9", template: "text", title: "Mark", translations: { fr: { title: "Marque" } } });
  const p = pageOf(entry("logo", 1, { translations: { fr: { title: "Logo FR" } } }), [fr], false, "fr");
  assert.equal(p.title, "Logo FR");
  assert.equal(p.sections[0].title, "Marque");
  assert.equal(pageOf(entry("logo", 1), [fr], false, null).sections[0], fr);
});

test("items: moved, added, copied and removed, translations following by position", () => {
  const s = {
    items: [{ title: "a" }, { title: "b" }, { title: "c" }],
    translations: { fr: { title: "T", items: [{ title: "A" }, null, { title: "C" }] }, de: { lede: "L" } },
  };
  const titles = (set: Record<string, unknown>) => (set.items as { title: string }[]).map((x) => x.title).join("");
  const fr = (set: Record<string, unknown>) => (set.translations as Record<string, { items?: unknown[] }>).fr.items;
  let set = moveItem(s, 0, 2);
  assert.equal(titles(set), "bca");
  assert.deepEqual(fr(set), [null, { title: "C" }, { title: "A" }]);
  // A language with no item words keeps none.
  assert.deepEqual((set.translations as Record<string, unknown>).de, { lede: "L" });
  set = insertItems(s, 1, [{ title: "x" }]);
  assert.equal(titles(set), "axbc");
  assert.deepEqual(fr(set), [{ title: "A" }, null, null, { title: "C" }]);
  set = duplicateItem(s, 0);
  assert.equal(titles(set), "aabc");
  assert.deepEqual(fr(set), [{ title: "A" }, { title: "A" }, null, { title: "C" }]);
  set = removeItem(s, 2);
  assert.equal(titles(set), "ab");
  // Trailing nulls go: the list is as long as its last word.
  assert.deepEqual(fr(set), [{ title: "A" }]);
  assert.deepEqual(removeItem({ items: [{ title: "a" }] }, 0), { items: null });
});

test("applyAll: a section moved to another page, undone as one", () => {
  const s = state();
  const t1 = s.pages.get("logo")![0];
  const r = applyAll(s, [on("logo", { op: "remove", id: "t1" }), on("overview", { op: "add", section: t1, after: "p1" })]);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(
    r.state.pages.get("overview")!.map((x) => x.id),
    ["c1", "p1", "t1"],
  );
  let back = r.state;
  for (const op of r.undo) back = apply(back, op).state;
  assert.equal(snap(back), snap(s));
  // One op refused: nothing changed.
  const no = applyAll(s, [on("logo", { op: "remove", id: "t1" }), on("nowhere", { op: "remove", id: "x" })]);
  assert.equal(no.state, s);
  assert.ok(no.errors.length);
});
