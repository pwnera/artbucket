import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeTags, prefixQuery } from "./search.ts";

test("tags are trimmed, lowercased, single-spaced and deduped", () => {
  assert.deepEqual(normalizeTags([" Brand ", "brand", "New   York", "", "  "]), ["brand", "new york"]);
});

test("every word becomes a required prefix", () => {
  assert.equal(prefixQuery("Fox her"), "fox:* & her:*");
  assert.equal(prefixQuery("fox_hero_v3.png"), "fox:* & hero:* & v3:* & png:*");
});

test("tsquery operators cannot be injected", () => {
  assert.equal(prefixQuery("a & !b | c:*"), "a:* & b:* & c:*");
  assert.equal(prefixQuery("'); drop"), "drop:*");
});

test("non-latin words survive", () => {
  assert.equal(prefixQuery("café 東京"), "café:* & 東京:*");
});

test("nothing searchable is null", () => {
  assert.equal(prefixQuery("  !!  "), null);
});
