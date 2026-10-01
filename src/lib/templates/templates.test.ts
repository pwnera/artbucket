import assert from "node:assert/strict";
import { test } from "node:test";
import { COLOR_SLOTS, FONT_SLOTS, ThemeSettings } from "../brand-theme.ts";
import { TEMPLATE_CARDS } from "../brand-templates.ts";
import { brandDomain } from "../portal.ts";
import { checkBindings, checkTree, PageInput, pageSlug, pageWarnings, parseSections } from "../pages.ts";
import { RuleInput, specKeys } from "../rules.ts";
import { TEMPLATES } from "./index.ts";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

// A new brand is made from these as set_rules, set_theme and save_page would take them: nothing may be refused.
for (const [id, t] of Object.entries(TEMPLATES)) {
  test(`template ${id} parses, binds and names only assets it can ingest`, () => {
    assert.equal(TEMPLATE_CARDS.find((c) => c.id === id)?.name, t.name);
    // Its BrandHub listing is claimable by whoever proves the brand's domain: every template names it, as a brand's domain reads.
    assert.equal(brandDomain(t.domain ?? ""), t.domain, `template ${id} names its brand's domain`);
    const rules = t.rules.map((r) => ({ assets: [], ...RuleInput.parse(r) }));
    const byKey = new Map(rules.map((r) => [r.key, r]));
    for (const r of rules) for (const k of specKeys("spec" in r ? r.spec : null)) assert.equal(byKey.get(k)?.type, "color", `${r.key} spec names ${k}`);

    const pages = t.pages.map(({ slug, ...input }) => {
      pageSlug.parse(slug);
      const parsed = PageInput.parse(input);
      const { sections, errors } = parseSections(parsed.sections);
      assert.deepEqual(errors, [], slug);
      assert.deepEqual(checkBindings(sections, rules), [], slug);
      return { slug, parent: parsed.parent ?? null, sections };
    });
    assert.deepEqual(checkTree(pages), []);
    for (const p of pages) assert.deepEqual(pageWarnings(p, pages, rules), [], p.slug);

    const theme = ThemeSettings.parse(t.theme);
    for (const k of COLOR_SLOTS) if (theme[k]) assert.equal(byKey.get(theme[k])?.type, "color", k);
    for (const k of FONT_SLOTS) if (theme[k]) assert.equal(byKey.get(theme[k])?.type, "font", k);

    const named = new Set(JSON.stringify({ rules: t.rules, theme: t.theme, pages: t.pages }).match(UUID) ?? []);
    for (const a of named) assert.ok(t.assets[a], `asset ${a} has no source in assets`);
    for (const { url } of Object.values(t.assets)) assert.match(url, /^https:\/\//);
  });
}
