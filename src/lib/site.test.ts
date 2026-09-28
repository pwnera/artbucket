import assert from "node:assert/strict";
import { test } from "node:test";
import type { Section } from "./pages.ts";
import { firstBinding, groupTabs, legacyAnchor, type NavPage, neighbors, order, trail, tree } from "./site.ts";

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
