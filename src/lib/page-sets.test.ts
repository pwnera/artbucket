import assert from "node:assert/strict";
import { test } from "node:test";
import { pageSet } from "./page-sets.ts";
import { checkTree, parseSections } from "./pages.ts";

test("a page set is eBay's six pages under the parent, each with sections that parse", () => {
  const set = pageSet("logo", "identity");
  assert.deepEqual(
    set.map((p) => [p.slug, p.title, p.parent]),
    [
      ["our-logo", "Our logo", "identity"],
      ["using-logo", "Using logo", "identity"],
      ["logo-in-product", "In product", "identity"],
      ["logo-in-marketing", "In marketing", "identity"],
      ["logo-best-practices", "Best practices", "identity"],
      ["logo-showcase", "Showcase", "identity"],
    ],
  );
  for (const p of set) {
    assert.ok(p.sections.length > 0, p.slug);
    assert.deepEqual(parseSections(p.sections).errors, [], p.slug);
  }
  assert.deepEqual(checkTree([{ slug: "identity" }, ...set]), []);
});

test("without a parent, a page named for the topic holds the set and lists it", () => {
  const [root, ...rest] = pageSet("  Brand Voice ");
  assert.deepEqual([root.slug, root.title, root.parent], ["brand-voice", "Brand Voice", null]);
  assert.equal(root.sections[0].template, "pages");
  assert.ok(rest.every((p) => p.parent === "brand-voice"));
  assert.deepEqual(rest[0].slug, "our-brand-voice");
  assert.deepEqual(pageSet("Café").map((p) => p.slug)[1], "our-cafe");
  assert.deepEqual(pageSet("!!"), []);
});
