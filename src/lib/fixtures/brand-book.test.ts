import assert from "node:assert/strict";
import { test } from "node:test";
import { checkWarnings, COLOR_SLOTS, deriveTheme, FONT_SLOTS, ThemeSettings } from "../brand-theme.ts";
import { assetRefs, boundKeys, checkBindings, checkTree, PageInput, pageSlug, pageWarnings, parseSections, TEMPLATES } from "../pages.ts";
import { RuleInput, specKeys } from "../rules.ts";
import { dirOf, scriptOf } from "../site.ts";
import { big, blender, FIXTURES, fixtureUrl, fixtureView, hairline, rtl, ugly } from "./brand-book.ts";

// scripts/mcp-eval.ts builds this book over MCP and expects no errors, no page
// warnings and the theme's three contrast warnings (its orange on white is
// 2.84:1); this catches a fixture edit that breaks it without a server.
test("blender parses, binds, makes a tree and warns about nothing but its orange", () => {
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
  const checks = deriveTheme(rules.map((r) => ({ context: null, ...r })), theme).checks.filter((c) => !c.ok);
  assert.deepEqual(checks.map((c) => c.pair), ["accent text on surface", "accent on surface", "text on accent"]);
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
  // The home is a landing page, with What's new; the rest read as a book.
  assert.equal(first.page?.layout, "landing");
  assert.equal(fixtureView("blender", "color").page?.layout, "book");
  assert.ok(first.updates?.length && first.media[first.updates[0].image!]);
  assert.equal(fixtureView("blender", "color").updates, undefined);
  assert.deepEqual(first.nav.filter((p) => p.home).map((p) => p.slug), ["overview"]);
  assert.equal(first.nav.find((p) => p.slug === "logo-use")?.parent, "logo");
  assert.deepEqual(first.contexts, ["dark-background", "print"]);
  assert.ok(first.theme.v1.accent && first.theme.v1.head);
  // The derived look, as the server gives it, and its failing pairs warn, as they do an editor.
  assert.deepEqual(first.theme.settings, blender().theme);
  assert.equal(first.theme.accent, "#e87d0d");
  assert.ok(first.theme.faces.head && first.theme.faces.body);
  assert.deepEqual(first.warnings, checkWarnings(first.theme.checks));
  assert.equal(first.warnings.length, 3);
  const mark = first.rules.find((r) => r.key === "logo.mark")!.assets[0].id;
  assert.match(fixtureUrl(mark), /^data:image\/svg\+xml,/);
  assert.notEqual(fixtureUrl(mark), fixtureUrl("not-drawn"));
  assert.throws(() => fixtureView("nope"), /No fixture "nope"/);
  assert.throws(() => fixtureView("blender", "nope"), /No page "nope"/);
});

test("big: 60 rules and a page of every blender section and 8 more, all binding", () => {
  const book = big();
  const rules = book.rules.map((r) => ({ assets: [], ...RuleInput.parse(r) }));
  assert.equal(new Set(rules.map((r) => `${r.key} ${r.context ?? ""}`)).size, 60);
  const { sections, errors } = parseSections(book.pages.at(-1)!.sections);
  assert.deepEqual(errors, []);
  const n = blender().pages.flatMap((p) => p.sections).length + 8;
  assert.equal(sections.length, n);
  assert.deepEqual(checkBindings(sections, rules), []);
  assert.equal(fixtureView("big", "everything").page?.sections.length, n);
});

// The theme's fixtures (W3): books that build as cleanly as blender, whose looks the guardrails must rescue.
test("ugly and hairline parse, bind and warn about nothing but contrast", () => {
  for (const [name, make] of [["ugly", ugly], ["hairline", hairline]] as const) {
    const book = make();
    const rules = book.rules.map((r) => ({ context: null, assets: [], ...RuleInput.parse(r) }));
    const pages = book.pages.map(({ slug, ...input }) => {
      const { sections, errors } = parseSections(PageInput.parse(input).sections);
      assert.deepEqual(errors, [], `${name}/${slug}`);
      assert.deepEqual(checkBindings(sections, rules), [], `${name}/${slug}`);
      return { slug, parent: null, sections };
    });
    for (const p of pages) assert.deepEqual(pageWarnings(p, pages, rules), [], `${name}/${p.slug}`);
    const theme = ThemeSettings.parse(book.theme);
    assert.ok(checkWarnings(deriveTheme(rules, theme).checks).length, `${name}: its accent fails on its surface`);
    for (const { slug } of book.pages) assert.equal(fixtureView(name, slug).page?.slug, slug);
    assert.equal(FIXTURES[name], make);
  }
  const tones = new Set(ugly().pages.flatMap((p) => p.sections.map((s) => s.tone ?? "plain")));
  assert.deepEqual([...tones].sort(), ["color", "dark", "image", "panel", "pattern", "plain", "tint"], "every ground but brand, which the header and band draw");
  assert.equal(hairline().theme.accentUse, "hairline");
});

// W5: a book written right to left, read in English too, falling back to its Arabic field by field.
test("rtl parses and binds, reads right to left, and falls back field by field", () => {
  const book = rtl();
  const rules = book.rules.map((r) => ({ context: null, assets: [], ...RuleInput.parse(r) }));
  const pages = book.pages.map(({ slug, ...input }) => {
    const { sections, errors } = parseSections(PageInput.parse(input).sections);
    assert.deepEqual(errors, [], slug);
    assert.deepEqual(checkBindings(sections, rules), [], slug);
    return { slug, parent: null, sections };
  });
  for (const p of pages) assert.deepEqual(pageWarnings(p, pages, rules), [], p.slug);
  const theme = ThemeSettings.parse(book.theme);
  assert.deepEqual(theme.languages?.map((l) => [l.code, l.dir ?? dirOf(l.code)]), [["ar", "rtl"], ["en", "ltr"]]);
  assert.equal(scriptOf("ar"), "Arab");
  assert.deepEqual(rules.flatMap((r) => (r.type === "font" && "spec" in r && r.spec?.script) || []), ["Arab", "Arab", "Latn"]);
  assert.deepEqual(checkWarnings(deriveTheme(rules, theme).checks), []);

  // As written: the first language.
  const ar = fixtureView("rtl");
  assert.equal(ar.lang, "ar");
  assert.equal(ar.page?.title, "نظرة عامة");
  assert.equal(ar.page?.sections[0].title, "واحة");
  // In English: what it has in English, the rest in Arabic, items by position.
  const en = fixtureView("rtl", null, "en");
  assert.equal(en.lang, "en");
  assert.deepEqual([en.page?.title, en.page?.eyebrow, en.page?.lede], ["Overview", "Brand guidelines", "كيف تبدو واحة وكيف تتكلم."]);
  const [cover, mission, values] = en.page!.sections;
  assert.deepEqual([cover.title, cover.lede, cover.eyebrow], ["Waha", "Reading is everyone's right.", "دليل الهوية"]);
  assert.deepEqual([mission.title, mission.body], ["Who we are", "مكتبات صغيرة في كل حي، مفتوحة من الصباح حتى المساء."]);
  assert.deepEqual(values.items?.map((it) => [it.title, it.text]), [["Reading", "كتاب في كل يد."], ["الكتابة", "لكل صوت مكان."]]);
  assert.deepEqual(en.nav.map((p) => p.title), ["Overview", "Color", "Typography"]);
  // Readers carry their own language's words only.
  assert.ok(en.page!.sections.every((s) => !("translations" in s)));
  assert.equal(FIXTURES.rtl, rtl);
});
