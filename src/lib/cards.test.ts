import assert from "node:assert/strict";
import { test } from "node:test";
import { CardQuery, cardEtag, cardFace, cardLogos, drawable, isCardTemplate, queryIssues, titleSize } from "./cards.ts";

test("a card's query: a title, trimmed; the rest optional; light unless asked", () => {
  assert.deepEqual(CardQuery.parse({ title: "  Hello  " }), { title: "Hello", theme: "light" });
  const missing = CardQuery.safeParse({});
  assert.equal(missing.success, false);
  assert.equal(queryIssues(missing.error!), "title: required");
  assert.equal(CardQuery.safeParse({ title: "   " }).success, false);
  assert.equal(CardQuery.safeParse({ title: "x".repeat(141) }).success, false);
  assert.equal(CardQuery.safeParse({ title: "x", image: "not-an-id" }).success, false);
  assert.equal(CardQuery.safeParse({ title: "x", theme: "sepia" }).success, false);
  assert.equal(CardQuery.parse({ title: "x", theme: "dark" }).theme, "dark");
});

test("templates are the ones named, nothing inherited", () => {
  assert.ok(isCardTemplate("og"));
  assert.ok(!isCardTemplate("square"));
  assert.ok(!isCardTemplate("toString"));
});

test("the ETag follows every input: the same inputs give the same tag, a new release or a word another", () => {
  const base = { template: "og", version: 3, q: { title: "Hi", theme: "light" }, look: { paper: "#fff" }, logo: "a" };
  assert.equal(cardEtag(base), cardEtag({ ...base }));
  assert.notEqual(cardEtag(base), cardEtag({ ...base, version: 4 }));
  assert.notEqual(cardEtag(base), cardEtag({ ...base, q: { title: "Hi!", theme: "light" } }));
  assert.match(cardEtag(base), /^"card-[\w-]{27}"$/);
});

test("a title shrinks as it grows", () => {
  const sizes = ["Short", "A title of some forty characters or so ok", "x".repeat(70), "x".repeat(140)].map(titleSize);
  assert.deepEqual([...sizes].sort((a, b) => b - a), sizes);
  assert.ok(sizes[0] > sizes[3]);
});

test("faces: TrueType, OpenType and WOFF are drawn, WOFF2 never; the upright nearest the weight wins", () => {
  assert.ok(drawable({ mime: "font/ttf", filename: "Inter-Bold.ttf" }));
  assert.ok(drawable({ mime: "application/octet-stream", filename: "Inter.otf" }));
  assert.ok(!drawable({ mime: "font/woff2", filename: "Inter.woff2" }));
  assert.ok(!drawable({ mime: "font/ttf", filename: "Inter.woff2" }));
  const files = [
    { id: "w2", mime: "font/woff2", filename: "Inter-Bold.woff2" },
    { id: "i", mime: "font/ttf", filename: "Inter-BoldItalic.ttf" },
    { id: "r", mime: "font/ttf", filename: "Inter-Regular.ttf" },
    { id: "s", mime: "font/ttf", filename: "Inter-SemiBold.ttf" },
  ];
  assert.equal(cardFace(files, 700)?.id, "s");
  assert.equal(cardFace(files, 400)?.id, "r");
  assert.equal(cardFace([files[0]], 400), undefined);
});

test("logos: the theme's on a light card; a reversed one first on a dark card, else the theme's in a dark context", () => {
  const r = (key: string, context: string | null = null) => ({ key, context });
  const rules = [r("color.primary"), r("logo.primary"), r("logo.mark"), r("logo.reversed"), r("logo.primary", "dark-background")];
  assert.deepEqual(cardLogos(rules, "logo.primary", false).map((x) => [x.key, x.context]), [["logo.primary", null], ["logo.mark", null], ["logo.reversed", null]]);
  assert.equal(cardLogos(rules, "logo.primary", true)[0].key, "logo.reversed");
  const noReversed = rules.filter((x) => x.key !== "logo.reversed");
  assert.deepEqual([cardLogos(noReversed, "logo.primary", true)[0]].map((x) => [x.key, x.context]), [["logo.primary", "dark-background"]]);
  assert.deepEqual(cardLogos([r("color.primary")], null, false), []);
});
