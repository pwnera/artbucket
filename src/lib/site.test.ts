import assert from "node:assert/strict";
import { test } from "node:test";
import type { Section } from "./pages.ts";
import type { SnapRule } from "./history.ts";
import {
  canonicalPath,
  dirOf,
  firstBinding,
  groupTabs,
  legacyAnchor,
  type NavPage,
  neighbors,
  order,
  resolvePath,
  scriptOf,
  searchSite,
  trail,
  tree,
} from "./site.ts";

const page = (slug: string, position: number, more: Partial<NavPage> = {}): NavPage => ({
  slug,
  title: slug,
  parent: null,
  position,
  icon: null,
  eyebrow: null,
  lede: null,
  cover: null,
  audience: "everyone",
  tabs: false,
  home: false,
  locked: false,
  updatedAt: null,
  ...more,
});

const section = (id: string, more: Partial<Section> = {}): Section => ({
  id,
  template: "text",
  title: "",
  body: "",
  width: "text",
  columns: 1,
  tone: "plain",
  hidden: false,
  keys: [],
  props: {},
  ...more,
});

// Given out of order, as the nav may come: the tree sorts by position.
const NAV = [
  page("color", 2),
  page("overview", 0, { home: true }),
  page("logo-use", 1, { parent: "logo" }),
  page("logo", 1, { tabs: true }),
  page("clear-space", 0, { parent: "logo" }),
  page("voice", 4),
  page("print", 0, { parent: "color" }),
  page("pantone", 0, { parent: "print" }),
  page("partners", 3, { locked: true, audience: "partners" }),
  page("orphan", 5, { parent: "hidden-page" }),
];

const shape = (ns: ReturnType<typeof tree>): unknown[] => ns.map((n) => (n.children.length ? [n.slug, n.number, shape(n.children)] : [n.slug, n.number]));

test("tree: siblings by position, numbered 01, 02.1, 02.1.3; the cover-first home and an orphan at the top", () => {
  assert.deepEqual(shape(tree(NAV, true)), [
    ["overview", null],
    [
      "logo",
      "01",
      [
        ["clear-space", "01.1"],
        ["logo-use", "01.2"],
      ],
    ],
    ["color", "02", [["print", "02.1", [["pantone", "02.1.1"]]]]],
    ["partners", "03"],
    ["voice", "04"],
    ["orphan", "05"],
  ]);
  const plain = tree(NAV, false);
  assert.equal(plain[1].number, null);
  assert.equal(plain[2].children[0].children[0].number, null);
  // Nothing under an unnumbered home is numbered either.
  assert.deepEqual(shape(tree([page("home", 0, { home: true }), page("start", 0, { parent: "home" }), page("next", 1)], true)), [
    ["home", null, [["start", null]]],
    ["next", "01"],
  ]);
  // A loop, which no save lets through, is never reached from the top: it drops out instead of hanging the reader.
  assert.deepEqual(shape(tree([page("a", 0, { parent: "b" }), page("b", 0, { parent: "a" }), page("c", 1)], true)), [["c", "01"]]);
});

test("order: depth first; a tabs page's children are read with it, not after it", () => {
  assert.deepEqual(
    order(tree(NAV, true)).map((n) => n.slug),
    ["overview", "logo", "color", "print", "pantone", "partners", "voice", "orphan"],
  );
});

test("neighbors: the pager passes over locked pages; a tab pages like its tabs page", () => {
  const roots = tree(NAV, true);
  const at = (slug: string) => {
    const { prev, next } = neighbors(roots, slug);
    return [prev?.slug, next?.slug];
  };
  assert.deepEqual(at("overview"), [undefined, "logo"]);
  assert.deepEqual(at("pantone"), ["print", "voice"]);
  assert.deepEqual(at("voice"), ["pantone", "orphan"]);
  assert.deepEqual(at("logo-use"), ["overview", "color"]);
  assert.deepEqual(at("orphan"), ["voice", undefined]);
  assert.deepEqual(neighbors(roots, "nope"), {});
});

test("trail: the breadcrumb from the top down to the page", () => {
  const roots = tree(NAV, true);
  assert.deepEqual(
    trail(roots, "pantone").map((n) => [n.slug, n.number]),
    [
      ["color", "02"],
      ["print", "02.1"],
      ["pantone", "02.1.1"],
    ],
  );
  assert.deepEqual(
    trail(roots, "orphan").map((n) => n.slug),
    ["orphan"],
  );
  assert.deepEqual(trail(roots, "nope"), []);
});

test("groupTabs: untabbed before the strip above it, untabbed after it below the panel, a tab's sections together", () => {
  const s = [
    section("intro"),
    section("screen", { tab: "Screen" }),
    section("note"),
    section("print", { tab: "Print" }),
    section("gradient", { tab: "Screen" }),
    section("end"),
  ];
  const ids = (xs: Section[]) => xs.map((x) => x.id);
  const g = groupTabs(s);
  assert.deepEqual(ids(g.before), ["intro"]);
  assert.deepEqual(
    g.tabs.map((t) => [t.name, ids(t.sections)]),
    [
      ["Screen", ["screen", "gradient"]],
      ["Print", ["print"]],
    ],
  );
  assert.deepEqual(ids(g.after), ["note", "end"]);
  const none = groupTabs([section("a"), section("b")]);
  assert.deepEqual([ids(none.before), none.tabs, none.after], [["a", "b"], [], []]);
});

test("legacyAnchor: v1's #rule- and #section- links find their page now; locked or unknown ones find nothing", () => {
  const pages = [
    { slug: "overview", sections: [section("cover", { template: "cover" })] },
    { slug: "logo-use", sections: [section("misuse", { template: "dodont", keys: ["logo.neverDo"] })] },
    { slug: "color", sections: [section("intro"), section("palette", { template: "palette", keys: ["color.primary"] })] },
    { slug: "voice", sections: [section("say", { template: "cards", items: [{ title: "Hi", key: "color.primary" }] })] },
    { slug: "partners", sections: [section("secret", { keys: ["tone.partner"] })] },
  ];
  assert.deepEqual(legacyAnchor(NAV, pages, "#rule-color.primary"), { page: "color", section: "palette" });
  // A tab is still a page of its own for a link.
  assert.deepEqual(legacyAnchor(NAV, pages, "rule-logo.neverDo"), { page: "logo-use", section: "misuse" });
  assert.equal(legacyAnchor(NAV, pages, "#rule-tone.partner"), null);
  assert.equal(legacyAnchor(NAV, pages, "#rule-color.gone"), null);
  assert.deepEqual(legacyAnchor(NAV, pages, "#section-color"), { page: "color" });
  assert.deepEqual(legacyAnchor([...NAV, page("type-scale", 6)], pages, "#section-typeScale"), { page: "type-scale" });
  assert.equal(legacyAnchor(NAV, pages, "#section-partners"), null);
  assert.equal(legacyAnchor(NAV, pages, "#palette"), null);
  assert.equal(legacyAnchor(NAV, pages, "#rule-%E0%A4%A"), null);
});

test("firstBinding: one section per page carries a key's rule- anchor, the first to bind it", () => {
  const s = [section("a"), section("b", { items: [{ key: "logo.mark" }] }), section("c", { keys: ["logo.mark"] })];
  assert.equal(firstBinding(s, "logo.mark"), "b");
  assert.equal(firstBinding(s, "logo.gone"), undefined);
});

// ---- portal paths -------------------------------------------------------------

test("resolvePath: the first brand's pages and old slugs first, then brands; the first brand by name redirects to its short form", () => {
  const brands = ["blender", "cycles", "logo"];
  const first = { slugs: ["overview", "logo", "color"], aliases: { marks: "logo" } };
  const at = (...path: string[]) => resolvePath(path, brands, first);
  assert.deepEqual(at(), { kind: "page", brand: "blender", page: null });
  assert.deepEqual(at("color"), { kind: "page", brand: "blender", page: "color" });
  // A page of the first brand wins over a brand of the same name.
  assert.deepEqual(at("logo"), { kind: "page", brand: "blender", page: "logo" });
  assert.deepEqual(at("marks"), { kind: "redirect", path: ["logo"] });
  assert.deepEqual(at("cycles"), { kind: "page", brand: "cycles", page: null });
  assert.deepEqual(at("blender"), { kind: "redirect", path: [] });
  assert.deepEqual(at("blender", "color"), { kind: "redirect", path: ["color"] });
  assert.deepEqual(at("blender", "marks"), { kind: "redirect", path: ["logo"] });
  // Another brand's pages and old slugs are planView's to find.
  assert.deepEqual(at("cycles", "nodes"), { kind: "page", brand: "cycles", page: "nodes" });
  for (const path of [["nope"], ["blender", "nope"], ["nope", "color"], ["cycles", "a", "b"], ["constructor"], ["blender", "toString"]]) {
    assert.deepEqual(resolvePath(path, brands, first), { kind: "missing" }, path.join("/"));
  }
  assert.deepEqual(resolvePath([], [], { slugs: [], aliases: {} }), { kind: "missing" });
});

test("canonicalPath: the first brand's pages at the top, the others under their brand", () => {
  assert.deepEqual(canonicalPath("blender", "blender", "logo"), ["logo"]);
  assert.deepEqual(canonicalPath("blender", "cycles", "logo"), ["cycles", "logo"]);
});

// ---- search -------------------------------------------------------------------

const snapRule = (key: string, type: SnapRule["type"], value: SnapRule["value"], more: Partial<SnapRule> = {}): SnapRule => ({
  key,
  context: null,
  type,
  value,
  usage: null,
  position: 0,
  assets: [],
  ...more,
});
const LONG = `${"Filler words about nothing much at all. ".repeat(6)}The orange blends into blue at the horizon. ${"More filler to close the paragraph. ".repeat(6)}`;
const PAGES = [
  { slug: "color", title: "Color", lede: "Orange and blue", sections: [section("palette", { title: "Palette", keys: ["color.primary"] }), section("story", { body: LONG })] },
  { slug: "logo", title: "Logo", sections: [section("marks", { title: "Orange marks", items: [{ title: "Clear space", text: "Keep **room** around it" }] })] },
  { slug: "print", title: "Print", sections: [section("inks", { keys: ["color.primary"] })] },
];
const RULES = [
  snapRule("color.primary", "color", "#e87d0d", { label: "Blender orange" }),
  snapRule("color.primary", "color", "#ff9933", { context: "dark-background" }),
  snapRule("type.heading", "font", { family: "Blender Pro", weight: 700 }),
];

test("searchSite: every word a prefix, anywhere in one page, section or rule; titles weigh most", () => {
  // A section title and a rule weigh 2, a page's lede and a body 1; ties keep reading order, rules after pages.
  const got = searchSite(PAGES, RULES, "Oran");
  assert.deepEqual(
    got.map((h) => [h.kind, h.page, h.section ?? null]),
    [
      ["section", "logo", "marks"],
      ["rule", "color", "palette"],
      ["page", "color", null],
      ["section", "color", "story"],
    ],
  );
  // A page title, 3, over a rule's key, 2.
  assert.deepEqual(searchSite(PAGES, RULES, "color").map((h) => h.kind), ["page", "rule"]);
  // Both words, in one section: its title and an item.
  assert.deepEqual(searchSite(PAGES, RULES, "orange room").map((h) => h.section), ["marks"]);
  assert.deepEqual(searchSite(PAGES, RULES, "orange nothing-like-it"), []);
  assert.deepEqual(searchSite(PAGES, RULES, " ! "), []);
  assert.equal(searchSite(PAGES, RULES, "o", 2).length, 2);
});

test("searchSite: a rule by its name, its key or any context's value, found where it is first shown", () => {
  const hit = searchSite(PAGES, RULES, "ff9933")[0];
  assert.deepEqual(hit, { kind: "rule", page: "color", section: "palette", title: "Blender orange", snippet: "#e87d0d \u00b7 #ff9933" });
  assert.equal(searchSite(PAGES, RULES, "color.primary").filter((h) => h.kind === "rule").length, 1);
  // A rule no page the reader may open shows is not found.
  assert.deepEqual(searchSite(PAGES, RULES, "blender pro"), []);
  assert.equal(searchSite(PAGES.slice(1), RULES, "e87d0d")[0].page, "print");
});

test("searchSite: snippets from the words, not the title, around the first word found", () => {
  const [page] = searchSite(PAGES, RULES, "color");
  assert.equal(page.snippet, "Orange and blue");
  const story = searchSite(PAGES, RULES, "horizon")[0];
  assert.equal(story.title, "Color");
  assert.match(story.snippet, /^\u2026.*The orange blends into blue at the horizon\..*\u2026$/);
  assert.ok(story.snippet.length <= 162, story.snippet);
  // Cut at word ends.
  assert.ok(LONG.includes(` ${story.snippet.slice(1, 20)}`), story.snippet);
  assert.ok(LONG.includes(`${story.snippet.slice(-20, -1)} `), story.snippet);
  // An item's text, as plain text: the field the word is in.
  assert.equal(searchSite(PAGES, RULES, "room")[0].snippet, "Keep room around it");
});

// ---- languages ----------------------------------------------------------------

test("scriptOf and dirOf: the script a language is written in, and which way it reads", () => {
  assert.deepEqual(["ar", "he", "fa", "ur", "en", "en-gb", "zh-tw", "sr", "ja", "ar-latn", "xx"].map(scriptOf), [
    "Arab",
    "Hebr",
    "Arab",
    "Arab",
    "Latn",
    "Latn",
    "Hant",
    "Cyrl",
    "Jpan",
    "Latn",
    "Latn",
  ]);
  assert.deepEqual(["ar", "he", "yi", "dv", "ckb", "en", "ar-latn", "ja", "not a tag"].map(dirOf), ["rtl", "rtl", "rtl", "rtl", "rtl", "ltr", "ltr", "ltr", "ltr"]);
});
