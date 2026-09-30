import assert from "node:assert/strict";
import { test } from "node:test";
import { agentScore, publishState, readiness, WEIGHTS } from "./readiness.ts";

const EMPTY = { rules: [], pages: [], versions: [], portals: [] };

test("a new brand starts at its colors, with every step to do", () => {
  const r = readiness(EMPTY);
  assert.equal(r.next, "colors");
  assert.equal(r.done, 0);
  assert.equal(r.total, 8);
  assert.deepEqual(
    r.steps.map((s) => s.id),
    ["colors", "type", "logo", "voice", "look", "pages", "publish", "portal"],
  );
});

test("a logo counts once its rule has a file; a key's context versions count once", () => {
  const rules = [
    { key: "color.primary", type: "color" },
    { key: "color.primary", type: "color" },
    { key: "type.heading", type: "font" },
    { key: "logo.minSize", type: "number" },
    { key: "logo.primary", type: "text", assets: [] },
  ];
  const r = readiness({ ...EMPTY, rules });
  const step = (id: string) => r.steps.find((s) => s.id === id)!;
  assert.equal(step("colors").detail, "1 color");
  assert.equal(step("logo").done, false);
  assert.equal(r.next, "logo");
  const withFile = readiness({ ...EMPTY, rules: [...rules, { key: "logo.primary", type: "text", assets: [{ id: "a" }] }] });
  assert.equal(withFile.next, "voice");
});

test("a cover alone isn't pages worth reading", () => {
  const thin = readiness({ ...EMPTY, pages: [{ sections: 1 }] });
  assert.equal(thin.steps.find((s) => s.id === "pages")!.done, false);
  const full = readiness({ ...EMPTY, pages: [{ sections: 2 }, { sections: 3 }] });
  assert.equal(full.steps.find((s) => s.id === "pages")!.detail, "2 pages, 5 sections");
});

test("publish state: a carried baseline or an older publish leaves changes unpublished", () => {
  assert.equal(publishState([]), "never");
  assert.equal(publishState([{ publishedAt: null }]), "never");
  assert.equal(publishState([{ publishedAt: "2026-01-01", publishedBy: "user:1" }]), "current");
  assert.equal(publishState([{ publishedAt: "2026-01-01", publishedBy: "artbucket" }]), "behind");
  assert.equal(publishState([{ publishedAt: null }, { publishedAt: "2026-01-01", publishedBy: "user:1" }]), "behind");
});

test("a caller who can't list portals isn't told to share, nor counted for it", () => {
  const r = readiness({ ...EMPTY, portals: null });
  assert.equal(r.steps.find((s) => s.id === "portal")!.done, null);
  assert.equal(r.total, 7);
});

test("a look is chosen once any layout setting is set; the colors alone are not one", () => {
  assert.equal(readiness({ ...EMPTY, theme: { accent: "color.primary" } }).steps.find((s) => s.id === "look")!.done, false);
  assert.equal(readiness({ ...EMPTY, theme: { header: "band" } }).steps.find((s) => s.id === "look")!.done, true);
});

test("the Brand Agent Score weighs the steps done, and says what each adds", () => {
  assert.equal(Object.values(WEIGHTS).reduce((a, b) => a + b, 0), 100);
  const empty = readiness(EMPTY);
  assert.equal(empty.score, 0);
  assert.equal(empty.steps.find((s) => s.id === "logo")!.points, 20);
  const some = readiness({ ...EMPTY, rules: [{ key: "color.primary", type: "color" }, { key: "tone.voice", type: "text" }] });
  assert.equal(some.score, 30);
  const all = agentScore(empty.steps.map((s) => ({ id: s.id, done: true })));
  assert.equal(all.score, 100);
});

test("a step the caller can't tell counts for nothing: the rest make the 100", () => {
  const r = readiness({ ...EMPTY, portals: null, rules: [{ key: "color.primary", type: "color" }] });
  assert.equal(r.steps.find((s) => s.id === "portal")!.points, 0);
  assert.equal(r.score, Math.round((100 * 15) / 95));
});
