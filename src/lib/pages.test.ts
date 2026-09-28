import assert from "node:assert/strict";
import { test } from "node:test";
import { canon, changedPages, checkBindings, initialPages, pageMarkdown, parseSections, samePages, type SnapPage } from "./pages.ts";
import type { Rule } from "./rules.ts";

const r = (key: string, type: Rule["type"], value: Rule["value"], assets: Rule["assets"] = []) => ({ key, type, value, usage: null, assets });
const logo = [{ id: "a1", rendition: null, preview: true }];

const RULES = [
  r("color.primary", "color", "#e87d0d"),
  r("color.secondary", "color", "#265787"),
  r("type.heading", "font", { family: "Inter", weight: 700 }),
  r("type.scale", "list", [12, 16, 24, 32]),
  r("logo.mark", "text", "The mark", logo),
  r("logo.minSize", "number", 24),
  r("logo.neverDo", "list", ["Stretch it"]),
  r("tone.voice", "text", "Plain and warm."),
  r("tone.always", "list", ["Short sentences"]),
];

test("sections: defaults from the template, ids kept or made", () => {
  const { sections, errors } = parseSections([{ template: "palette", keys: ["color.primary"] }, { id: "intro", template: "text", body: "Hi" }]);
  assert.deepEqual(errors, []);
  assert.equal(sections[0].width, "wide");
  assert.equal(sections[0].columns, 3);
  assert.equal(sections[0].tone, "plain");
  assert.match(sections[0].id, /^s[a-z0-9]+$/);
  assert.equal(sections[1].id, "intro");
  assert.deepEqual(sections[1].keys, []);
});

test("sections: every problem at once, each with its path", () => {
  const { errors } = parseSections([
    { template: "palette", keys: ["color.primary", "color.primary"] },
    { template: "collection", props: { limit: 500, chanel: "web" } },
    { template: "hero" },
    { id: "x", template: "text" },
    { id: "x", template: "text" },
  ]);
  assert.ok(errors.some((e) => e.startsWith("sections[0].keys: Each key once")), errors.join("\n"));
  assert.ok(errors.some((e) => e.startsWith("sections[1].props.limit")), errors.join("\n"));
  assert.ok(errors.some((e) => e.startsWith("sections[1].props") && e.includes("chanel")), errors.join("\n"));
  assert.ok(errors.some((e) => e.startsWith("sections[2].template")), errors.join("\n"));
  assert.ok(errors.includes('sections: section id "x" is used twice'));
});

test("collection: a collection or a saved search, not both", () => {
  const both = { template: "collection", props: { collection: crypto.randomUUID(), search: crypto.randomUUID() } };
  assert.match(parseSections([both]).errors.join(), /not both/);
  assert.deepEqual(parseSections([{ template: "collection", props: { query: "type=image&f.channel=web" } }]).errors, []);
});

test("bindings: unknown keys name the section's rules; a template takes only what it can show", () => {
  const { sections } = parseSections([
    { template: "palette", keys: ["color.primery", "type.heading"] },
    { template: "cover", keys: ["color.primary"] },
    { template: "logos", keys: ["logo.mark", "logo.minSize"] },
    { template: "type", keys: ["type.heading", "type.scale"] },
  ]);
  assert.deepEqual(checkBindings(sections, RULES), [
    'sections[0].keys[0]: no rule "color.primery"; this brand has color.primary, color.secondary',
    "sections[0].keys[1]: a Color palette section shows color rules; type.heading is a font",
    "sections[1].keys: a Cover section binds no rules",
    "sections[2].keys[1]: a Logo showcase section shows rules with assets (the logo files); logo.minSize is a number with no assets",
  ]);
});

test("bindings: a key the page already had stays, even with its rule gone", () => {
  const { sections } = parseSections([{ template: "palette", keys: ["color.gone"] }]);
  assert.deepEqual(checkBindings(sections, RULES, new Set(["color.gone"])), []);
});

test("a first layout: every rule on some page, each where it fits", () => {
  const pages = initialPages(RULES, "Blender");
  assert.deepEqual(
    pages.map((p) => p.slug),
    ["overview", "color", "type", "logo", "tone"],
  );
  const bound = pages.slice(1).flatMap((p) => p.sections.flatMap((s) => s.keys ?? []));
  assert.deepEqual([...bound].sort(), RULES.map((x) => x.key).sort());
  const logoPage = pages.find((p) => p.slug === "logo")!;
  assert.deepEqual(
    logoPage.sections.map((s) => [s.template, s.keys]),
    [
      ["logos", ["logo.mark"]],
      ["text", ["logo.minSize"]],
      ["dodont", ["logo.neverDo"]],
    ],
  );
  // What initialPages makes, save_page takes.
  for (const p of pages) {
    const { sections, errors } = parseSections(p.sections);
    assert.deepEqual([...errors, ...checkBindings(sections, RULES)], [], p.slug);
  }
});

test("comparing pages ignores key order, which jsonb doesn't keep", () => {
  const a: SnapPage[] = [{ slug: "logo", title: "Logo", position: 0, hidden: false, sections: [] }];
  const b = JSON.parse('[{"sections":[],"hidden":false,"position":0,"title":"Logo","slug":"logo"}]');
  assert.equal(canon(a), canon(b));
  assert.ok(samePages(a, b));
  assert.ok(samePages(null, []));
  assert.deepEqual(changedPages(a, [{ ...a[0], title: "Logos" }, { ...a[0], slug: "color" }]), ["page:logo", "page:color"]);
});

test("markdown: what a page says and shows", () => {
  const { sections } = parseSections([
    { id: "p", template: "palette", title: "Palette", keys: ["color.primary"] },
    { id: "h", template: "text", title: "Hidden", hidden: true },
    { id: "c", template: "collection", title: "Posters", props: { query: "tag=poster" } },
  ]);
  assert.equal(
    pageMarkdown({ title: "Color", sections }, RULES),
    [
      "# Color",
      "",
      "## Palette",
      "<!-- palette p -->",
      "",
      "- **Primary** (`color.primary`): #e87d0d",
      "",
      "## Posters",
      "<!-- collection c -->",
      "",
      "Assets from the library, filtered by tag=poster.",
    ].join("\n"),
  );
});
