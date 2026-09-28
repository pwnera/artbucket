import assert from "node:assert/strict";
import { test } from "node:test";
import { COLOR_SLOTS, FONT_SLOTS, ThemeSettings } from "../brand-theme.ts";
import { assetRefs, boundKeys, checkBindings, checkTree, PageInput, pageSlug, pageWarnings, parseSections, TEMPLATES } from "../pages.ts";
import { RuleInput, specKeys } from "../rules.ts";
import { big, blender, fixtureUrl, fixtureView } from "./brand-book.ts";

// scripts/mcp-eval.ts builds this book over MCP and expects no errors and no
// warnings; this catches a fixture edit that breaks it without a server.
test("blender parses, binds, makes a tree and warns about nothing", () => {
  const book = blender();
  const rules = book.rules.map((r) => ({ assets: [], ...RuleInput.parse(r) }));
  const byKey = new Map(rules.map((r) => [r.key, r]));
  for (const r of rules) for (const k of specKeys("spec" in r ? r.spec : null)) assert.equal(byKey.get(k)?.type, "color", `${r.key} spec names ${k}`);

  const pages = book.pages.map(({ slug, ...input }) => {
    pageSlug.parse(slug);
    const parsed = PageInput.parse(input);
    const { sections, errors } = parseSections(parsed.sections);
    assert.deepEqual(errors, [], slug);
    assert.deepEqual(checkBindings(sections, rules), [], slug);
    return { slug, parent: parsed.parent ?? null, sections };
  });
  assert.deepEqual(checkTree(pages), []);
  // The dev page and the eval render and round-trip every template through this book.
  const used = new Set(pages.flatMap((p) => p.sections.map((s) => s.template)));
  assert.deepEqual(TEMPLATES.filter((t) => !used.has(t)), []);
  for (const p of pages) assert.deepEqual(pageWarnings(p, pages, rules), [], p.slug);

  const theme = ThemeSettings.parse(book.theme);
  for (const k of COLOR_SLOTS) if (theme[k]) assert.equal(byKey.get(theme[k])?.type, "color", k);
  for (const k of FONT_SLOTS) if (theme[k]) assert.equal(byKey.get(theme[k])?.type, "font", k);
  assert.ok(theme.logo && byKey.get(theme.logo)?.assets?.length);
});

// The dev page draws these views; a renderer finds every rule and picture a section names.
test("fixtureView: each blender page, with its rules and pictures", () => {
  for (const { slug } of blender().pages) {
    const v = fixtureView("blender", slug);
    assert.equal(v.page?.slug, slug);
    const keys = new Set(v.rules.map((r) => r.key));
    for (const s of v.page!.sections) for (const k of boundKeys(s)) assert.ok(keys.has(k), `${slug}/${s.id}: ${k}`);
    for (const { id, at } of assetRefs({ cover: v.page!.cover, sections: v.page!.sections })) assert.ok(v.media[id], `${slug} ${at}`);
    for (const s of v.page!.sections.filter((x) => x.template === "collection")) assert.ok(v.collections[s.id].items.length, s.id);
  }
  const first = fixtureView("blender");
  assert.equal(first.page?.slug, "overview");
  assert.deepEqual(first.nav.filter((p) => p.home).map((p) => p.slug), ["overview"]);
  assert.equal(first.nav.find((p) => p.slug === "logo-use")?.parent, "logo");
  assert.deepEqual(first.contexts, ["dark-background"]);
  assert.ok(first.theme.v1.accent && first.theme.v1.head);
  const mark = first.rules.find((r) => r.key === "logo.mark")!.assets[0].id;
  assert.match(fixtureUrl(mark), /^data:image\/svg\+xml,/);
  assert.notEqual(fixtureUrl(mark), fixtureUrl("not-drawn"));
  assert.throws(() => fixtureView("nope"), /No fixture "nope"/);
  assert.throws(() => fixtureView("blender", "nope"), /No page "nope"/);
});

test("big: 60 rules and a page of 30 sections, all binding", () => {
  const book = big();
  const rules = book.rules.map((r) => ({ assets: [], ...RuleInput.parse(r) }));
  assert.equal(new Set(rules.map((r) => `${r.key} ${r.context ?? ""}`)).size, 60);
  const { sections, errors } = parseSections(book.pages.at(-1)!.sections);
  assert.deepEqual(errors, []);
  assert.equal(sections.length, 30);
  assert.deepEqual(checkBindings(sections, rules), []);
  assert.equal(fixtureView("big", "everything").page?.sections.length, 30);
});
