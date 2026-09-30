import assert from "node:assert/strict";
import { test } from "node:test";
import { sameState, type BrandState } from "./brand-files.ts";
import { merge } from "./brand-merge.ts";
import type { SnapRule } from "./history.ts";
import type { Section, SnapPage } from "./pages.ts";

const rule = (key: string, value: string, position: number, over: Partial<SnapRule> = {}): SnapRule => ({
  key,
  context: null,
  type: key.startsWith("color.") ? "color" : "text",
  value,
  usage: null,
  position,
  assets: [],
  ...over,
});
const text = (id: string, body: string): Section => ({ id, template: "text", title: "", body, width: "text", columns: 1, tone: "plain", hidden: false, keys: [], props: {} });
const page = (slug: string, position: number, over: Partial<SnapPage> = {}): SnapPage => ({ slug, title: slug, position, hidden: false, sections: [text("text", slug)], ...over });

const base = (): BrandState => ({
  name: "Acme",
  theme: { accent: "color.primary", radius: 4 },
  rules: [rule("color.primary", "#111111", 0), rule("color.ink", "#000000", 1), rule("tone.voice", "Plain", 2)],
  pages: [page("overview", 0), page("color", 1), page("voice", 2)],
});
const edit = (s: BrandState, f: (s: BrandState) => void) => {
  const c = structuredClone(s);
  f(c);
  return c;
};
const value = (s: BrandState, key: string) => s.rules.find((r) => r.key === key && r.context === null)?.value;

test("nothing changed on either side: nothing changes", () => {
  const m = merge(base(), base(), base());
  assert.ok(sameState(m.state, base()));
  assert.deepEqual(m.conflicts, []);
});

test("each side's change to a different piece is kept", () => {
  const ours = edit(base(), (s) => (s.rules[0].value = "#222222"));
  const theirs = edit(base(), (s) => (s.rules[2].value = "Warm"));
  const m = merge(base(), ours, theirs);
  assert.equal(value(m.state, "color.primary"), "#222222");
  assert.equal(value(m.state, "tone.voice"), "Warm");
  assert.deepEqual(m.conflicts, []);
});

test("the same change on both sides is no conflict", () => {
  const both = edit(base(), (s) => (s.rules[0].value = "#333333"));
  const m = merge(base(), both, structuredClone(both));
  assert.equal(value(m.state, "color.primary"), "#333333");
  assert.deepEqual(m.conflicts, []);
});

test("both changed one rule differently: the repository wins, and says so", () => {
  const ours = edit(base(), (s) => (s.rules[0].value = "#aaaaaa"));
  const theirs = edit(base(), (s) => (s.rules[0].value = "#bbbbbb"));
  const m = merge(base(), ours, theirs);
  assert.equal(value(m.state, "color.primary"), "#bbbbbb");
  assert.equal(m.conflicts.length, 1);
  assert.equal(m.conflicts[0].what, "rule color.primary");
});

test("a removal on one side goes through; removed there and changed here is a conflict the repository wins", () => {
  const theirs = edit(base(), (s) => (s.rules = s.rules.filter((r) => r.key !== "tone.voice")));
  assert.equal(value(merge(base(), base(), theirs).state, "tone.voice"), undefined);

  const ours = edit(base(), (s) => (s.rules[2].value = "Changed"));
  const m = merge(base(), ours, theirs);
  assert.equal(value(m.state, "tone.voice"), undefined);
  assert.equal(m.conflicts[0].what, "rule tone.voice");
});

test("additions on both sides are all kept, each after its neighbour", () => {
  const ours = edit(base(), (s) => s.rules.push(rule("color.accent", "#ff0000", 1)));
  const theirs = edit(base(), (s) => s.pages.push(page("logo", 3)));
  const m = merge(base(), ours, theirs);
  assert.equal(value(m.state, "color.accent"), "#ff0000");
  assert.ok(m.state.pages.some((p) => p.slug === "logo"));
  assert.deepEqual(m.conflicts, []);
});

test("theme settings merge one by one", () => {
  const ours = edit(base(), (s) => (s.theme.radius = 12));
  const theirs = edit(base(), (s) => (s.theme.nav = "top"));
  const m = merge(base(), ours, theirs);
  assert.equal(m.state.theme.radius, 12);
  assert.equal(m.state.theme.nav, "top");
});

test("page order: ours moved pages, theirs added one; both hold", () => {
  const ours = edit(base(), (s) => {
    s.pages[0].position = 2;
    s.pages[2].position = 0;
  });
  const theirs = edit(base(), (s) => s.pages.push(page("logo", 1.5)));
  theirs.pages.sort((a, b) => a.position - b.position).forEach((p, i) => (p.position = i));
  const m = merge(base(), ours, theirs);
  assert.deepEqual(
    m.state.pages.map((p) => p.slug),
    ["voice", "color", "logo", "overview"],
  );
});

test("a page moved under a page the other side removed sits at the top", () => {
  const ours = edit(base(), (s) => (s.pages[2].parent = "color"));
  const theirs = edit(base(), (s) => (s.pages = s.pages.filter((p) => p.slug !== "color")));
  const m = merge(base(), ours, theirs);
  const voice = m.state.pages.find((p) => p.slug === "voice")!;
  assert.equal(voice.parent, undefined);
});

test("a page's sections are one piece: both editing one page is a conflict", () => {
  const ours = edit(base(), (s) => (s.pages[1].sections[0].body = "ours"));
  const theirs = edit(base(), (s) => (s.pages[1].title = "Colour"));
  const m = merge(base(), ours, theirs);
  assert.equal(m.state.pages.find((p) => p.slug === "color")!.title, "Colour");
  assert.equal(m.conflicts[0].what, "page color");
});
