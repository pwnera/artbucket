import assert from "node:assert/strict";
import { test } from "node:test";
import { COLOR_SLOTS, FONT_SLOTS, ThemeSettings } from "../brand-theme.ts";
import { checkBindings, checkTree, PageInput, pageSlug, pageWarnings, parseSections, TEMPLATES } from "../pages.ts";
import { RuleInput, specKeys } from "../rules.ts";
import { blender } from "./brand-book.ts";

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
