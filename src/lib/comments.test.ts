import assert from "node:assert/strict";
import { test } from "node:test";
import { openCounts, pageNow, sectionKey, threads } from "./comments.ts";

const at = (minutes: number) => new Date(Date.parse("2026-09-29T10:00:00Z") + minutes * 60_000).toISOString();
const c = (id: string, over: Partial<{ parent: string | null; resolvedAt: string | null; createdAt: string; page: string; section: string | null }> = {}) => ({
  id,
  parent: null,
  resolvedAt: null,
  createdAt: at(0),
  page: "logo",
  section: null,
  ...over,
});

test("replies gather under their root, oldest first", () => {
  const [t, ...rest] = threads([c("r2", { parent: "a", createdAt: at(5) }), c("a"), c("r1", { parent: "a", createdAt: at(2) })]);
  assert.equal(rest.length, 0);
  assert.equal(t.id, "a");
  assert.deepEqual(
    t.replies.map((r) => r.id),
    ["r1", "r2"],
  );
});

test("open threads come first, the one that moved last on top; resolved ones after, the last settled first", () => {
  const out = threads([
    c("old", { createdAt: at(0) }),
    c("new", { createdAt: at(10) }),
    // Started first, but a reply just came in: it moved last.
    c("busy", { createdAt: at(-60) }),
    c("reply", { parent: "busy", createdAt: at(20) }),
    c("done-early", { createdAt: at(30), resolvedAt: at(31) }),
    c("done-late", { createdAt: at(-5), resolvedAt: at(40) }),
  ]);
  assert.deepEqual(
    out.map((t) => t.id),
    ["busy", "new", "old", "done-late", "done-early"],
  );
});

test("a reply whose root isn't there is left out", () => {
  assert.deepEqual(threads([c("stray", { parent: "gone" })]), []);
});

test("open threads are counted by page and by section, keyed with the page so ids can repeat across pages", () => {
  const counts = openCounts([
    c("a", { page: "logo", section: "intro" }),
    c("b", { page: "logo", section: "intro" }),
    c("c", { page: "color", section: "intro" }),
    c("d", { page: "logo" }),
    c("e", { page: "logo", section: "intro", resolvedAt: at(1) }),
    c("f", { page: "logo", section: "intro", parent: "a" }),
  ]);
  assert.equal(counts.open, 4);
  assert.deepEqual([...counts.byPage], [["logo", 3], ["color", 1]]);
  assert.equal(counts.bySection.get(sectionKey("logo", "intro")), 2);
  assert.equal(counts.bySection.get(sectionKey("color", "intro")), 1);
  assert.equal(counts.bySection.size, 2);
});

test("a renamed page keeps its comments; a slug a page has now wins over an old name", () => {
  const now = pageNow([
    { slug: "logos", aliases: ["logo", "marks"] },
    { slug: "marks", aliases: [] },
  ]);
  assert.equal(now("logo"), "logos");
  assert.equal(now("marks"), "marks");
  assert.equal(now("deleted"), "deleted");
});
