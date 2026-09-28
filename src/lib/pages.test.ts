import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import {
  applyOps,
  assetRefs,
  boundKeys,
  canon,
  changedPages,
  checkBindings,
  checkSection,
  checkTree,
  collectionQuery,
  hiddenSlugs,
  initialPages,
  issues,
  mergedProps,
  pageMarkdown,
  pageWarnings,
  PageInput,
  parseSections,
  pickText,
  renameKey,
  samePages,
  SectionInput,
  SectionWire,
  siteLinks,
  templateCatalog,
  TEMPLATES,
  PageOp,
  type Item,
  type Section,
  type SnapPage,
} from "./pages.ts";
import type { Rule } from "./rules.ts";

const r = (key: string, type: Rule["type"], value: Rule["value"], assets: Rule["assets"] = []) => ({ key, type, value, usage: null, assets });
const logo = [{ id: "a1", rendition: null, preview: true }];
const A = "0b0e3c6a-5f6d-4c1e-9a53-7d1f6f2b8e01";
const B = "5c7a1e2d-8b3f-4d6e-a1c9-2e4f6a8b0c12";

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

/** A stored section, as a test states one: the defaults, then what it sets. */
const stored = (s: Partial<Section> & Pick<Section, "id" | "template">): Section => ({
  title: "",
  body: "",
  width: "wide",
  columns: 1,
  tone: "plain",
  hidden: false,
  keys: [],
  props: {},
  ...s,
});

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
  assert.ok(errors.includes("sections[1].props.chanel: Unrecognized key"), errors.join("\n"));
  assert.ok(errors.some((e) => e.startsWith("sections[2].template")), errors.join("\n"));
  assert.ok(errors.includes('sections: section id "x" is used twice'));
});

test("a misspelled prop reads the same on both doors: the flat wire and the strict parse", () => {
  const bad = { template: "collection", props: { chanel: "web" } };
  const wire = SectionWire.safeParse(bad);
  assert.ok(!wire.success);
  assert.deepEqual(issues(wire.error, "sections[1]"), ["sections[1].props.chanel: Unrecognized key"]);
  assert.deepEqual(parseSections([{ template: "text" }, bad]).errors, ["sections[1].props.chanel: Unrecognized key"]);
  // Another template's prop passes the wire, which merges them, and fails the section's own template.
  assert.ok(SectionWire.safeParse({ template: "palette", props: { flip: true } }).success);
  assert.deepEqual(parseSections([{ template: "palette", props: { flip: true } }]).errors, ["sections[0].props.flip: Unrecognized key"]);
});

test("collection: a collection or a saved search, not both", () => {
  const both = { template: "collection", props: { collection: crypto.randomUUID(), search: crypto.randomUUID() } };
  assert.match(parseSections([both]).errors.join(), /not both/);
  assert.deepEqual(parseSections([{ template: "collection", props: { query: "type=image&f.channel=web" } }]).errors, []);
});

// ---- the model's new fields -------------------------------------------------

const FULL = {
  id: "donts",
  template: "dodont",
  keys: ["logo.neverDo"],
  eyebrow: "02",
  lede: "What never to do with the mark.",
  aside: "See [the marks](/logo#marks).",
  tab: "Print",
  tone: "color",
  background: { color: "color.primary" },
  items: [
    { verdict: "dont", title: "Stretch it", text: "Scale it evenly.", asset: A, key: "logo.mark", link: "/logo#marks", download: false },
    { verdict: "do", caption: "Room to breathe" },
  ],
  audience: "partners",
  contexts: ["default", "print"],
  only: "print",
};

test("new fields round-trip: stored as given, and a stored section parses again as itself", () => {
  const { sections, errors } = parseSections([FULL]);
  assert.deepEqual(errors, []);
  const [s] = sections;
  for (const k of ["eyebrow", "lede", "aside", "tab", "tone", "background", "items", "audience", "contexts", "only"] as const) assert.deepEqual(s[k], FULL[k], k);
  // edit_page's update op re-parses { ...stored, ...set }: a stored section must stay a valid input.
  assert.ok(SectionInput.safeParse(s).success);
  const again = parseSections([JSON.parse(JSON.stringify(s))]);
  assert.deepEqual(again.errors, []);
  assert.equal(canon(again.sections[0]), canon(s));
});

test("a section from before these fields normalizes to the same canon (no spurious versions)", () => {
  const w0 = { id: "p", template: "palette", title: "Palette", keys: ["color.primary"] };
  const { sections } = parseSections([w0]);
  const before = { id: "p", template: "palette", title: "Palette", body: "", width: "wide", columns: 3, tone: "plain", hidden: false, keys: ["color.primary"], props: {} };
  assert.equal(canon(sections[0]), canon(before));
  // And the stored W0 row, read back from jsonb, re-parses unchanged.
  assert.equal(canon(parseSections([before]).sections[0]), canon(before));
});

test("boundKeys: keys, then items' keys, then the background color; each once, in order", () => {
  const s = stored({
    id: "a",
    template: "dodont",
    keys: ["logo.neverDo", "logo.always"],
    items: [{ key: "logo.always" }, { key: "logo.mark" }, { title: "none" }],
    background: { color: "color.primary" },
  });
  assert.deepEqual(boundKeys(s), ["logo.neverDo", "logo.always", "logo.mark", "color.primary"]);
  assert.deepEqual(boundKeys(stored({ id: "b", template: "cover" })), []);
});

test("renameKey: all three places, null when nothing bound it, and never a key twice", () => {
  const sections = [
    stored({ id: "a", template: "dodont", keys: ["color.old", "color.new"], items: [{ key: "color.old" }], background: { color: "color.old" }, tone: "color" }),
    stored({ id: "b", template: "text", keys: ["tone.voice"] }),
  ];
  const got = renameKey(sections, "color.old", "color.new")!;
  assert.deepEqual(got[0].keys, ["color.new"]);
  assert.deepEqual(got[0].items, [{ key: "color.new" }]);
  assert.deepEqual(got[0].background, { color: "color.new" });
  assert.equal(got[1], sections[1]);
  assert.equal(renameKey(sections, "color.gone", "color.x"), null);
});

test("assetRefs: every asset a page names, with its path", () => {
  const page = {
    cover: A,
    sections: [
      stored({ id: "a", template: "split", props: { image: A } }),
      stored({ id: "b", template: "cover", props: { video: B }, tone: "image", background: { image: B } }),
      stored({ id: "c", template: "gallery", items: [{ asset: A }, { title: "no picture" }, { asset: B }] }),
    ],
  };
  assert.deepEqual(assetRefs(page), [
    { id: A, at: "cover" },
    { id: A, at: "sections[0].props.image" },
    { id: B, at: "sections[1].props.video" },
    { id: B, at: "sections[1].background.image" },
    { id: A, at: "sections[2].items[0].asset" },
    { id: B, at: "sections[2].items[2].asset" },
  ]);
  assert.deepEqual(assetRefs({ cover: null, sections: [] }), []);
});

test("siteLinks: pages and sections linked from bodies, asides and items; outside links and asset URLs are not", () => {
  const page = {
    slug: "color",
    sections: [
      stored({
        id: "a",
        template: "text",
        body: 'See [the mark](/logo), [clear space](/logo#clear-space "Clear space"), [below](#palette), [Figma](https://figma.com/x), ![x](/a/abc/w_800).\n\n[ref]: /type#scale',
        aside: "[mail](mailto:a@b.c) and [voice](/voice-and-tone)",
      }),
      stored({ id: "b", template: "dodont", items: [{ verdict: "do", link: "#a", text: "[more](/imagery)" }, { verdict: "dont", link: "https://x.org" }] }),
    ],
  };
  assert.deepEqual(siteLinks(page), [
    { at: "sections[0].body", slug: "logo" },
    { at: "sections[0].body", slug: "logo", section: "clear-space" },
    { at: "sections[0].body", slug: "color", section: "palette" },
    { at: "sections[0].body", slug: "type", section: "scale" },
    { at: "sections[0].aside", slug: "voice-and-tone" },
    { at: "sections[1].items[0].text", slug: "imagery" },
    { at: "sections[1].items[0].link", slug: "color", section: "a" },
  ]);
});

test("checkSection: grounds need their parameter, items go where the template lists them", () => {
  const at = "sections[0]";
  const check = (s: Partial<Section> & Pick<Section, "template">) => checkSection(stored({ id: "x", ...s }), at);
  assert.deepEqual(check({ template: "text", tone: "color" }), ["sections[0].background.color: tone color needs the color rule it is set on"]);
  assert.deepEqual(check({ template: "text", background: { color: "color.primary" } }), ["sections[0].background.color: only for tone color"]);
  assert.deepEqual(check({ template: "text", tone: "image" }), ["sections[0].background.image: tone image needs a picture"]);
  assert.deepEqual(check({ template: "text", tone: "dark", background: { scrim: 0.3 } }), ["sections[0].background.scrim: only for tone image"]);
  assert.deepEqual(check({ template: "text", tone: "image", background: { image: A, scrim: 0.3 } }), []);
  assert.deepEqual(check({ template: "palette", items: [{ title: "x" }] }), ["sections[0].items: a Color palette section takes no items"]);
  assert.deepEqual(check({ template: "gallery", items: [{ asset: A, verdict: "do" }, { title: "no picture" }] }), [
    "sections[0].items[0].verdict: only do/don't and logos items take a verdict",
    "sections[0].items[1]: a Gallery item needs asset",
  ]);
  assert.deepEqual(check({ template: "dodont", items: [{ title: "which?" }] }), ["sections[0].items[0]: a Do / Don't item needs verdict"]);
  assert.deepEqual(check({ template: "cover", contexts: ["default", "print"] }), ["sections[0].contexts: a Cover section binds no rules, so it has no contexts to show"]);
  assert.deepEqual(check({ template: "palette", contexts: ["default", "print"], only: "print" }), []);
  // parseSections runs it, so both doors refuse these.
  assert.deepEqual(parseSections([{ template: "text", tone: "color" }]).errors, ["sections[0].background.color: tone color needs the color rule it is set on"]);
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
    "sections[2].keys[1]: a Logo showcase section shows rules with assets (the logo files), and color rules to set them on; logo.minSize is a number with no assets",
  ]);
});

test("bindings: items' keys and the background color are checked with their paths", () => {
  const { sections, errors } = parseSections([
    { template: "dodont", tone: "color", background: { color: "type.heading" }, items: [{ verdict: "do", key: "logo.mrak" }] },
    { template: "text", tone: "color", background: { color: "color.primary" } },
  ]);
  assert.deepEqual(errors, []);
  assert.deepEqual(checkBindings(sections, RULES), [
    'sections[0].items[0].key: no rule "logo.mrak"; this brand has logo.mark, logo.minSize, logo.neverDo',
    "sections[0].background.color: a background is a color rule; type.heading is a font",
  ]);
});

test("bindings: a key the page already had stays, even with its rule gone", () => {
  const { sections } = parseSections([{ template: "palette", keys: ["color.gone"] }]);
  assert.deepEqual(checkBindings(sections, RULES, new Set(["color.gone"])), []);
});

test("checkTree: an unknown parent, a loop and a fourth level", () => {
  assert.deepEqual(
    checkTree([
      { slug: "home", parent: null },
      { slug: "logo", parent: "home" },
      { slug: "clear-space", parent: "logo" },
      { slug: "color" },
    ]),
    [],
  );
  assert.deepEqual(checkTree([{ slug: "logo", parent: "brand" }]), ['page "logo": its parent "brand" is not a page']);
  assert.deepEqual(
    checkTree([
      { slug: "a", parent: "b" },
      { slug: "b", parent: "a" },
      { slug: "c", parent: "a" },
      { slug: "d", parent: "d" },
    ]),
    ['page "a": a loop, a > b > a', 'page "d": a loop, d > d'],
  );
  assert.deepEqual(
    checkTree([
      { slug: "a", parent: null },
      { slug: "b", parent: "a" },
      { slug: "c", parent: "b" },
      { slug: "d", parent: "c" },
    ]),
    ['page "d": 4 levels deep; three at most'],
  );
});

// ---- edit_page --------------------------------------------------------------

const PAGE = [stored({ id: "a", template: "text", title: "A" }), stored({ id: "b", template: "palette", keys: ["color.primary"] })];
const ops = (raw: unknown[]) => z.array(PageOp).parse(raw) as PageOp[];

test("applyOps: add, update, move and remove in order; page ops fold into one patch", () => {
  const { sections, page, errors } = applyOps(
    PAGE,
    ops([
      { op: "add", section: { template: "text", title: "Top" }, after: null },
      { op: "add", section: { id: "c", template: "text", title: "End" } },
      { op: "update", id: "a", set: { title: "A2", eyebrow: "01" } },
      { op: "move", id: "b", after: null },
      { op: "remove", id: "c" },
      { op: "page", set: { title: "Logo", parent: "brand" } },
      { op: "page", set: { title: "Logos", slug: "logos" } },
    ]),
    "logo",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(
    sections.map((s) => [s.title, s.eyebrow]),
    [
      ["", undefined],
      ["Top", undefined],
      ["A2", "01"],
    ],
  );
  assert.match(sections[1].id, /^s[a-z0-9]+$/);
  assert.deepEqual(page, { title: "Logos", parent: "brand", slug: "logos" });
  assert.equal(PAGE.length, 2, "the stored sections are left alone");
});

test("applyOps: null clears a field in an update", () => {
  const withEyebrow = [stored({ id: "a", template: "text", eyebrow: "01", lede: "Hi" })];
  const { sections, errors } = applyOps(withEyebrow, ops([{ op: "update", id: "a", set: { eyebrow: null } }]), "p");
  assert.deepEqual(errors, []);
  assert.equal("eyebrow" in sections[0], false);
  assert.equal(sections[0].lede, "Hi");
});

test("applyOps: a bad add is reported with its path, never dropped silently", () => {
  const { errors } = applyOps(
    PAGE,
    ops([
      { op: "add", section: { template: "palette", props: { flip: true } } },
      { op: "add", section: { template: "dodont", items: [{ title: "which?" }] } },
      { op: "add", section: { id: "a", template: "text" } },
      { op: "update", id: "b", set: { props: { flip: true } } },
      { op: "move", id: "zz", after: null },
    ]),
    "logo",
  );
  assert.deepEqual(errors, [
    "ops[0].section.props.flip: Unrecognized key",
    "ops[1].section.items[0]: a Do / Don't item needs verdict",
    'ops[2].section.id: "a" is taken on logo',
    "ops[3].set.props.flip: Unrecognized key",
    'ops[4]: no section "zz" on logo; its sections are a, b',
  ]);
});

test("applyOps: the 61st section is refused, counted after every op", () => {
  const full = Array.from({ length: 60 }, (_, i) => stored({ id: `s${i}`, template: "text" }));
  assert.deepEqual(applyOps(full, ops([{ op: "add", section: { template: "text" } }]), "p").errors, ["ops: that makes 61 sections; a page holds 60 at most"]);
  assert.deepEqual(
    applyOps(
      full,
      ops([
        { op: "add", section: { template: "text" } },
        { op: "remove", id: "s0" },
      ]),
      "p",
    ).errors,
    [],
  );
});

// ---- reading and warning ----------------------------------------------------

test("collectionQuery: the saved search narrowed by the section's query, with what readers must never pass on dropped", () => {
  const saved = "q=poster&tag=a&type=image&f.channel=web&collection=c1&status=proposed&review=true&proposedBy=bot&limit=5&offset=10";
  const q = collectionQuery(saved, { query: "?q=red&tag=b&type=video&f.channel=print&limit=2" });
  assert.equal(q.get("q"), "poster red");
  assert.deepEqual(q.getAll("tag"), ["a", "b"]);
  assert.deepEqual(q.getAll("f.channel"), ["web", "print"]);
  assert.deepEqual(q.getAll("type"), ["video"]);
  assert.equal(q.get("collection"), "c1");
  for (const k of ["status", "review", "proposedBy", "limit", "offset"]) assert.equal(q.has(k), false, k);
  assert.deepEqual(collectionQuery(saved, { collection: "c2" }).getAll("collection"), ["c2"]);
  assert.equal(collectionQuery(null, { query: "tag=poster&status=draft" }).toString(), "tag=poster");
  assert.equal(collectionQuery(null, {}).toString(), "");
});

test("pageWarnings: links to missing or hidden pages and sections, bound keys with no rule", () => {
  const page = {
    slug: "color",
    sections: [
      stored({
        id: "palette",
        template: "palette",
        keys: ["color.primary", "color.gone"],
        body: "[a](/logo) [b](/logos) [c](/logo#nope) [d](/logo#old) [e](/secret) [f](#palette) [g](/brand-mark) [h](#nope)",
      }),
    ],
  };
  const pages = [
    { slug: "logo", hidden: false, sections: [stored({ id: "marks", template: "logos" }), stored({ id: "old", template: "text", hidden: true })], aliases: ["brand-mark"] },
    { slug: "secret", hidden: true, sections: [] },
  ];
  assert.deepEqual(pageWarnings(page, pages, RULES), [
    'sections[0].body: links to /logos, but there is no page "logos"',
    'sections[0].body: links to /logo#nope, but logo has no section "nope"',
    "sections[0].body: links to /logo#old, a hidden section",
    "sections[0].body: links to /secret, which is hidden",
    'sections[0].body: links to /color#nope, but color has no section "nope"',
    'sections[0].keys[1]: no rule "color.gone"; readers see nothing for it',
  ]);
});

// ---- W2 templates -------------------------------------------------------------

test("W2 templates: cover's hero props, do/don't layouts, and cards, links and pages with their items", () => {
  const ok = [
    { template: "cover", props: { image: A, video: B, align: "center", height: "screen", strip: false } },
    { template: "header", eyebrow: "02", title: "Using it", props: { image: A } },
    { template: "dodont", keys: ["logo.neverDo"], props: { layout: "rows" } },
    { template: "cards", keys: ["tone.always", "tone.voice"], items: [{ title: "Free", icon: "heart", link: "/logo" }], props: { layout: "list" } },
    { template: "links", keys: ["logo.mark"], items: [{ asset: A }, { title: "Figma", link: "https://figma.com/x", label: "Figma" }] },
    { template: "pages", props: { from: "logo", layout: "list", depth: 2 } },
    { template: "pages", items: [{ link: "/logo" }, { link: "/logo#marks", title: "The marks", asset: A }] },
  ];
  const { sections, errors } = parseSections(ok);
  assert.deepEqual([...errors, ...checkBindings(sections, RULES)], []);

  assert.deepEqual(
    parseSections([
      { template: "cover", props: { height: "huge" } },
      { template: "palette", props: { layout: "rows" } },
      { template: "cards", items: [{ text: "no title" }] },
      { template: "links", items: [{ title: "Nowhere" }, { link: "https://x.org" }] },
      { template: "pages", items: [{ title: "which?" }, { link: "https://x.org" }, { link: "#top" }] },
      { template: "pages", props: { from: "logo" }, items: [{ link: "/logo" }] },
      { template: "cards", items: [{ title: "x", icon: "hearts" }] },
      { template: "pages", props: { depth: 4 } },
    ]).errors,
    [
      'sections[0].props.height: Invalid option: expected one of "auto"|"tall"|"screen"',
      "sections[1].props.layout: Unrecognized key",
      "sections[2].items[0]: a Cards item needs title",
      "sections[3].items[0]: a Links item needs link or asset",
      "sections[3].items[1]: a Links item needs title or asset",
      "sections[4].items[0]: a Pages item needs link",
      "sections[4].items[1].link: a page of this brand, as /slug",
      "sections[4].items[2].link: a page of this brand, as /slug",
      "sections[5].props.from: items pick the pages, from shows a page's children; one or the other",
      "sections[6].items[0].icon: One of the icons a page takes",
      "sections[7].props.depth: Too big: expected number to be <=3",
    ],
  );
  // A header binds nothing, so it has no contexts; cards bind rules, so they do.
  assert.deepEqual(parseSections([{ template: "header", contexts: ["default", "print"] }]).errors, [
    "sections[0].contexts: a Header section binds no rules, so it has no contexts to show",
  ]);
  assert.deepEqual(checkBindings(parseSections([{ template: "cards", keys: ["color.primary"] }]).sections, RULES), [
    "sections[0].keys[0]: a Cards section shows text and list rules; color.primary is a color",
  ]);
});

test("W2 templates: layouts merge into one enum on the wire, each template's values named", () => {
  const layout = mergedProps().shape.layout;
  assert.deepEqual([...(layout.unwrap() as z.ZodEnum).options].sort(), ["bento", "cards", "carousel", "grid", "list", "masonry", "pairs", "rows"]);
  assert.equal(
    layout.description,
    "cards: cards, list; dodont: pairs, grid, rows; gallery: grid, bento, carousel; collection: grid, masonry, list; links: cards, list; pages: cards, list",
  );
});

test("W2 templates: a pages section's from is a link, so a missing page warns and markdown says whose pages", () => {
  const page = { slug: "home", sections: [stored({ id: "next", template: "pages", props: { from: "logos" } })] };
  assert.deepEqual(siteLinks(page), [{ at: "sections[0].props.from", slug: "logos" }]);
  assert.deepEqual(pageWarnings(page, [], RULES), ['sections[0].props.from: links to /logos, but there is no page "logos"']);
  assert.match(pageMarkdown({ title: "Home", sections: page.sections }, []), /The pages under \/logos\./);
  assert.match(pageMarkdown({ title: "Home", sections: [stored({ id: "n", template: "pages" })] }, []), /The pages under this one\./);
});

// ---- W4 rule depth --------------------------------------------------------------

test("W4 props: palette, type, logos, gallery and diagram settings, and a gallery item's span", () => {
  const ok = [
    { template: "palette", keys: ["color.primary"], props: { show: ["hex", "cmyk", "pantone"], media: "print", matrix: true, ase: true } },
    { template: "type", keys: ["type.heading"], props: { sample: "Aa", roles: true, glyphs: false, embed: true } },
    { template: "logos", keys: ["logo.mark", "color.primary"], props: { kit: false }, items: [{ asset: A, key: "color.primary", verdict: "dont", caption: "Lost" }] },
    { template: "gallery", props: { layout: "bento" }, items: [{ asset: A, span: 2 }, { asset: B, span: 1 }] },
    { template: "gallery", props: { layout: "carousel" }, items: [{ asset: A }] },
    { template: "diagram", keys: ["logo.mark", "logo.minSize"], props: { kind: "minsize" }, contexts: ["default", "print"] },
    { template: "diagram", keys: ["logo.mark"], props: { kind: "placement", positions: ["tl", "br"] } },
    { template: "diagram", keys: ["logo.mark"], props: { kind: "cobrand", partner: "Studio", separator: "x" }, items: [{ asset: B, title: "Studio" }] },
  ];
  const { sections, errors } = parseSections(ok);
  assert.deepEqual([...errors, ...checkBindings(sections, RULES)], []);
  assert.equal(sections[3].items?.[0].span, 2);
  assert.ok(SectionInput.safeParse(sections[3]).success, "a stored span parses again");

  assert.deepEqual(
    parseSections([
      { template: "palette", props: { show: ["cmky"] } },
      { template: "gallery", props: { layout: "masonry" } },
      { template: "gallery", items: [{ asset: A, span: 3 }] },
      { template: "dodont", items: [{ verdict: "do", span: 2 }] },
      { template: "logos", items: [{ asset: A, key: "color.primary", verdict: "do" }, { asset: A }] },
      { template: "diagram", props: { kind: "lockup", positions: ["top"] } },
      { template: "diagram", props: { kind: "clearspace" }, items: [{ asset: A }] },
      { template: "diagram", items: [{ asset: A }] },
      { template: "diagram", props: { kind: "cobrand" }, items: [{ title: "No mark" }] },
    ]).errors,
    [
      'sections[0].props.show[0]: Invalid option: expected one of "hex"|"rgb"|"hsl"|"cmyk"|"pantone"|"ral"|"token"|"css"',
      'sections[1].props.layout: Invalid option: expected one of "grid"|"bento"|"carousel"',
      "sections[2].items[0].span: Too big: expected number to be <=2",
      "sections[3].items[0].span: only gallery items span",
      "sections[4].items[0].verdict: a logos item marks a pair never to use: dont",
      "sections[4].items[1]: a Logo showcase item needs key",
      'sections[5].props.kind: Invalid option: expected one of "clearspace"|"minsize"|"placement"|"cobrand"',
      'sections[5].props.positions[0]: Invalid option: expected one of "tl"|"tc"|"tr"|"ml"|"mc"|"mr"|"bl"|"bc"|"br"',
      "sections[6].items: only a cobrand diagram takes items, its partner",
      "sections[7].items: only a cobrand diagram takes items, its partner",
      "sections[8].items[0]: a Diagram item needs asset",
    ],
  );
});

test("W4 bindings: logos take colors as grounds, and an item's key is one; a diagram takes a mark and numbers", () => {
  const { sections } = parseSections([
    { template: "logos", keys: ["logo.mark", "color.primary", "tone.voice"], items: [{ asset: A, key: "type.heading" }] },
    { template: "diagram", keys: ["logo.mark", "logo.minSize", "color.primary"] },
  ]);
  assert.deepEqual(checkBindings(sections, RULES), [
    "sections[0].keys[2]: a Logo showcase section shows rules with assets (the logo files), and color rules to set them on; tone.voice is text with no assets",
    "sections[0].items[0].key: a logos item's key is a color rule; type.heading is a font",
    "sections[1].keys[2]: a Diagram section shows a rule with assets (the mark) and number rules (clear space in x, sizes in px or mm); color.primary is a color with no assets",
  ]);
});

/** Number rules with units, and a print version of one: what the units warning reads. */
const SIZES: Parameters<typeof pageWarnings>[2] = [
  ...RULES.filter((x) => x.key !== "logo.minSize"),
  { ...r("logo.minSize", "number", 24), spec: { unit: "px" } },
  { ...r("logo.minSize", "number", 8), context: "print", spec: { unit: "mm" } },
  { ...r("logo.clearSpace", "number", 0.5), spec: { unit: "x" } },
  { ...r("logo.minHeight", "number", 40), spec: { unit: "px" } },
  { ...r("logo.minPrint", "number", 10), spec: { unit: "mm" } },
];

test("pageWarnings: lengths in two units side by side, per context; ratios mix with anything", () => {
  const page = (keys: string[], extra: Partial<Section> = {}) => ({ slug: "logo", sections: [stored({ id: "a", template: "text", keys, ...extra })] });
  assert.deepEqual(pageWarnings(page(["logo.minSize", "logo.clearSpace"]), [], SIZES), [], "px and x: not the same measure");
  assert.deepEqual(pageWarnings(page(["logo.minSize", "logo.minPrint"]), [], SIZES), [
    "sections[0]: mixes px and mm (logo.minSize in px, logo.minPrint in mm); give them one unit",
  ]);
  // In print, minSize reads its print version beside minHeight's default: mm beside px.
  assert.deepEqual(pageWarnings(page(["logo.minSize", "logo.minHeight"]), [], SIZES), [
    "sections[0]: mixes mm and px in print (logo.minSize in mm, logo.minHeight in px); give them one unit",
  ]);
});

test("pageWarnings: a diagram with nothing to draw from", () => {
  const diagram = (keys: string[], props: Record<string, unknown> = {}, items?: Item[]) => ({
    slug: "logo",
    sections: [stored({ id: "d", template: "diagram", keys, props, ...(items && { items }) })],
  });
  assert.deepEqual(pageWarnings(diagram(["logo.mark", "logo.clearSpace"]), [], SIZES), []);
  assert.deepEqual(pageWarnings(diagram(["logo.mark"]), [], SIZES), [
    "sections[0].keys: a clearspace diagram draws from a number rule, its clear space in x; bind one",
  ]);
  assert.deepEqual(pageWarnings(diagram(["logo.minSize"], { kind: "minsize" }), [], SIZES), ["sections[0].keys: a minsize diagram draws a mark; bind a rule with its picture"]);
  assert.deepEqual(pageWarnings(diagram(["logo.mark"], { kind: "placement" }), [], SIZES), []);
  assert.deepEqual(pageWarnings(diagram(["logo.mark"], { kind: "cobrand" }), [], SIZES), [
    "sections[0]: a cobrand diagram needs its partner: an item with their mark, or props.partner",
  ]);
  assert.deepEqual(pageWarnings(diagram(["logo.mark"], { kind: "cobrand" }, [{ asset: B }]), [], SIZES), []);
});

test("markdown: a logos section's forbidden pairs, and what a diagram draws", () => {
  const { sections, errors } = parseSections([
    { id: "l", template: "logos", keys: ["logo.mark", "color.primary"], items: [{ asset: A, key: "color.primary", caption: "Lost" }] },
    { id: "d", template: "diagram", keys: ["logo.mark"], props: { kind: "cobrand", partner: "Studio", positions: ["tl"] } },
  ]);
  assert.deepEqual(errors, []);
  const md = pageMarkdown({ title: "Logo", sections }, RULES);
  assert.match(md, new RegExp(`- Don't: asset ${A} on \`color\\.primary\`\\. Lost`));
  assert.match(md, /Drawn: cobrand, at tl, beside Studio\./);
});

test("edit_page names a section by id with no pattern: the op finds it or lists the ones there are", () => {
  assert.deepEqual(applyOps(PAGE, ops([{ op: "remove", id: "Not an id!" }]), "logo").errors, ['ops[0]: no section "Not an id!" on logo; its sections are a, b']);
});

// ---- the advertised shapes ------------------------------------------------------

test("mergedProps: one copy of each prop; enums merge; any other clash throws", () => {
  const merged = mergedProps();
  const all = new Set(TEMPLATES.flatMap((t) => Object.keys(templateCatalog().templates.find((x) => x.template === t)!.props.properties as object)));
  assert.deepEqual(Object.keys(merged.shape).sort(), [...all].sort());
  assert.match(merged.shape.image.description!, /^cover: .+; split: .+/);

  const layouts = mergedProps({
    a: z.strictObject({ layout: z.enum(["grid", "list"]).optional(), n: z.number().optional().describe("How many") }),
    b: z.strictObject({ layout: z.enum(["list", "rows"]).optional(), n: z.number().optional() }),
  });
  assert.deepEqual((layouts.shape.layout.unwrap() as z.ZodEnum).options, ["grid", "list", "rows"]);
  assert.equal(layouts.shape.layout.description, "a: grid, list; b: list, rows");
  assert.throws(
    () => mergedProps({ a: z.strictObject({ size: z.number().optional() }), b: z.strictObject({ size: z.string().optional() }) }),
    /props\.size is one thing in a and another in b/,
  );
  assert.throws(() => mergedProps({ a: z.strictObject({ n: z.number().max(10) }), b: z.strictObject({ n: z.number().max(20) }) }), /props\.n/);
});

test("templateCatalog: the 15 templates, each with an example that parses as itself and passes its checks", () => {
  const { templates, common } = templateCatalog();
  assert.deepEqual(
    templates.map((t) => t.template),
    [...TEMPLATES],
  );
  assert.equal(templates.length, 15);
  for (const t of templates) {
    assert.equal(t.example.template, t.template);
    const { sections, errors } = parseSections([t.example]);
    assert.deepEqual(errors, [], t.template);
    assert.ok(SectionWire.safeParse(t.example).success, t.template);
    assert.equal(sections[0].template, t.template);
    assert.equal((t.props as { $schema?: string }).$schema, undefined);
  }
  assert.equal(templates.find((t) => t.template === "dodont")!.items, "a do or a don't with its picture: verdict (needed), asset, title, text, caption");
  assert.equal(templates.find((t) => t.template === "palette")!.items, null);
  for (const t of ["cards", "links", "pages", "logos", "diagram"]) assert.ok(templates.find((x) => x.template === t)!.items, t);
  assert.equal(templates.find((t) => t.template === "header")!.items, null);
  for (const k of ["id", "tone", "keys", "items", "background", "audience", "contexts", "only"]) assert.ok(common.includes(k), k);
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
  // The Overview's contents pick every other page, since none sits under it.
  const contents = pages[0].sections.at(-1)!;
  assert.equal(contents.template, "pages");
  assert.deepEqual(contents.items, ["/color", "/type", "/logo", "/tone"].map((link) => ({ link })));
  // What initialPages makes, save_page takes, and its links all land.
  const saved = pages.map((p) => ({ slug: p.slug, sections: parseSections(p.sections).sections }));
  for (const p of pages) {
    const { sections, errors } = parseSections(p.sections);
    assert.deepEqual([...errors, ...checkBindings(sections, RULES)], [], p.slug);
  }
  assert.deepEqual(pageWarnings(saved[0], saved, RULES), []);
});

test("comparing pages ignores key order, which jsonb doesn't keep, and when they were written", () => {
  const a: SnapPage[] = [{ slug: "logo", title: "Logo", position: 0, hidden: false, sections: [] }];
  const b = JSON.parse('[{"sections":[],"hidden":false,"position":0,"title":"Logo","slug":"logo"}]');
  assert.equal(canon(a), canon(b));
  assert.ok(samePages(a, b));
  assert.ok(samePages(null, []));
  assert.deepEqual(changedPages(a, [{ ...a[0], title: "Logos" }, { ...a[0], slug: "color" }]), ["page:logo", "page:color"]);
  const later = [{ ...a[0], updatedAt: "2026-09-28T10:00:00Z" }];
  assert.ok(samePages(a, later));
  assert.deepEqual(changedPages(a, later), []);
  assert.deepEqual(changedPages(a, [{ ...later[0], parent: "brand" }]), ["page:logo"]);
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

test("markdown: eyebrow, lede, aside, items, tone and audience, so agents read the whole page back", () => {
  const { sections, errors } = parseSections([FULL]);
  assert.deepEqual(errors, []);
  assert.equal(
    pageMarkdown({ title: "Logo", eyebrow: "Chapter 2", lede: "The mark and its rules.", audience: "members", sections }, RULES),
    [
      "# Logo",
      "<!-- audience=members -->",
      "",
      "_Chapter 2_",
      "",
      "The mark and its rules.",
      "",
      "## Do / Don't",
      '<!-- dodont donts tone=color audience=partners tab="Print" contexts=default,print only=print -->',
      "",
      "_02_",
      "",
      "What never to do with the mark.",
      "",
      "- **Never do** (`logo.neverDo`): Stretch it",
      "",
      "- Don't: **Stretch it** Scale it evenly. (/logo#marks)",
      "- Do: Room to breathe",
      "",
      "> See [the marks](/logo#marks).",
    ].join("\n"),
  );
});

// ---- W5: updates, languages, layout ---------------------------------------------

test("updates: its limit is collection's on the wire, 20 at most on the page, and markdown says how many", () => {
  assert.match(mergedProps().shape.limit.description!, /^collection: .+; updates: .+/);
  const { sections, errors } = parseSections([{ id: "new", template: "updates", title: "What's new" }]);
  assert.deepEqual(errors, []);
  assert.equal(pageMarkdown({ title: "Home", sections }, RULES).split("\n").at(-1), "The latest 5 publishes.");
  assert.deepEqual(parseSections([{ template: "updates", props: { limit: 21 } }]).errors, ["sections[0].props.limit: an updates section lists 20 publishes at most"]);
  assert.deepEqual(parseSections([{ template: "updates", keys: ["tone.voice"] }]).errors, []);
  assert.deepEqual(checkBindings(parseSections([{ template: "updates", keys: ["tone.voice"] }]).sections, RULES), ["sections[0].keys: a What's new section binds no rules"]);
});

test("translations: stored when given, a stored section parses again as itself; tags are lowercase", () => {
  const translations = { ar: { title: "\u0627\u0644\u0634\u0639\u0627\u0631", items: [null, { caption: "\u0645\u0633\u0627\u062d\u0629" }] }, "en-gb": { body: "Colour" } };
  const { sections, errors } = parseSections([{ ...FULL, translations }]);
  assert.deepEqual(errors, []);
  assert.deepEqual(sections[0].translations, translations);
  assert.ok(SectionInput.safeParse(JSON.parse(JSON.stringify(sections[0]))).success);
  assert.equal("translations" in parseSections([{ template: "text" }]).sections[0], false);
  assert.match(parseSections([{ template: "text", translations: { AR: { title: "x" } } }]).errors.join(), /translations/);
  assert.match(parseSections([{ template: "text", translations: { ar: { template: "cover" } } }]).errors.join(), /translations\.ar\.template: Unrecognized key/);
});

test("pickText: the language's words, then its base language's, then as written, field by field; items by position", () => {
  const s = {
    title: "Logo",
    lede: "The mark",
    body: "Give it room.",
    items: [{ title: "Stretch", text: "Never" }, { title: "Room" }],
    translations: { ar: { title: "AR title", lede: "AR lede", items: [null, { title: "AR room" }] }, "ar-eg": { lede: "EG lede", body: "  ", items: [{ text: "EG never" }] } },
  };
  const eg = pickText(s, "ar-eg");
  assert.deepEqual([eg.title, eg.lede, eg.body], ["AR title", "EG lede", "Give it room."]);
  assert.deepEqual(eg.items, [{ title: "Stretch", text: "EG never" }, { title: "AR room" }]);
  assert.equal(pickText(s, "fr"), s);
  assert.equal(pickText(s, null), s);
  assert.deepEqual(pickText({ title: "Logo", translations: { ar: {} } }, "ar"), { title: "Logo", translations: { ar: {} } });
  // A page's own words too, with no items.
  assert.equal(pickText({ title: "Color", translations: { de: { title: "Farbe" } } }, "de").title, "Farbe");
});

test("layout round-trips through PageInput and the page op; book never enters a snapshot", () => {
  assert.equal(PageInput.parse({ title: "Home", sections: [], layout: "landing" }).layout, "landing");
  assert.equal(PageInput.parse({ title: "Home", sections: [] }).layout, undefined);
  assert.ok(!PageInput.safeParse({ title: "Home", sections: [], layout: "wide" }).success);
  assert.deepEqual(applyOps(PAGE, ops([{ op: "page", set: { layout: "book" } }]), "logo").page, { layout: "book" });
  const translated = PageInput.parse({ title: "Home", sections: [], translations: { ar: { title: "x", lede: "y" } } });
  assert.deepEqual(translated.translations, { ar: { title: "x", lede: "y" } });
  assert.ok(PageInput.safeParse({ title: "Home", sections: [], translations: null }).success);
  const landing: SnapPage = { slug: "home", title: "Home", position: 0, hidden: false, sections: [], layout: "landing" };
  // @ts-expect-error A book page leaves layout out (D5): a snapshot never says book.
  const book: SnapPage = { ...landing, layout: "book" };
  assert.ok(landing && book);
});

test("markdown: a landing page says so beside its audience", () => {
  assert.equal(pageMarkdown({ title: "Home", layout: "landing", sections: [] }, RULES), "# Home\n<!-- layout=landing -->");
  assert.equal(pageMarkdown({ title: "Home", layout: "landing", audience: "partners", sections: [] }, RULES), "# Home\n<!-- audience=partners layout=landing -->");
  assert.equal(pageMarkdown({ title: "Home", layout: "book", sections: [] }, RULES), "# Home");
});

test("hiddenSlugs: a hidden page and every page under it; a loop ends", () => {
  const page = (slug: string, parent: string | null, hidden = false) => ({ slug, parent, hidden });
  const pages = [page("a", null, true), page("b", "a"), page("c", "b"), page("d", null), page("e", "d"), page("x", "y"), page("y", "x")];
  assert.deepEqual([...hiddenSlugs(pages)].sort(), ["a", "b", "c"]);
});
