import assert from "node:assert/strict";
import { test } from "node:test";
import type { SnapRule } from "./history.ts";
import { type Level, planView, type Plan, type Source } from "./page-view.ts";
import type { Section, SnapPage } from "./pages.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const MARK = id(1);
const COVER = id(2);
const PICTURE = id(3);
const PASTED = id(4);
const TEXTURE = id(5);
const DEVICE = id(6);
const SECRET_COVER = id(7);
const HIDDEN_PICTURE = id(8);
const MEMBERS_PICTURE = id(9);
const FONT = id(10);

const rule = (key: string, type: SnapRule["type"], value: SnapRule["value"], more: Partial<SnapRule> = {}): SnapRule => ({
  key,
  context: null,
  type,
  value,
  usage: null,
  position: 0,
  assets: [],
  ...more,
});

const section = (sid: string, more: Partial<Section> = {}): Section => ({
  id: sid,
  template: "text",
  title: sid,
  body: "",
  width: "text",
  columns: 1,
  tone: "plain",
  hidden: false,
  keys: [],
  props: {},
  ...more,
});

const RULES: SnapRule[] = [
  rule("color.primary", "color", "#e87d0d", { spec: { pair: "color.ink", texture: TEXTURE } }),
  rule("color.ink", "color", "#111111"),
  rule("color.accent", "color", "#265787"),
  rule("color.accent", "color", "#8fb3d9", { context: "dark-background" }),
  rule("color.secret", "color", "#ff00ff"),
  rule("type.heading", "font", { family: "Blender Pro" }, { spec: { role: "display" }, assets: [{ id: FONT, rendition: null }] }),
  rule("tone.voice", "text", `Warm. ![a](/a/${PASTED}/w_800)`),
  rule("tone.members", "text", "For members only"),
  rule("tone.hidden", "text", "Not yet"),
  rule("logo.mark", "text", "The mark", { assets: [{ id: MARK, rendition: null }] }),
];

const PAGES: SnapPage[] = [
  {
    slug: "overview",
    title: "Overview",
    position: 0,
    hidden: false,
    sections: [
      section("intro", { template: "text", keys: ["tone.voice"], body: `See ![b](/a/${PICTURE})` }),
      section("draft", { hidden: true, keys: ["tone.hidden"], body: `![c](/a/${HIDDEN_PICTURE})` }),
      section("inner", { audience: "members", keys: ["tone.members"], props: {}, body: `![d](/a/${MEMBERS_PICTURE})` }),
      section("dark", { only: "dark-background", keys: ["tone.voice"] }),
      section("swatches", { template: "palette", keys: ["color.accent"], contexts: ["default", "dark-background"] }),
      section("posters", { template: "collection", props: { query: "tag=poster" } }),
    ],
  },
  {
    slug: "logo",
    title: "Logo",
    position: 1,
    hidden: false,
    aliases: ["marks"],
    cover: COVER,
    sections: [section("marks", { template: "logos", keys: ["logo.mark", "logo.gone"] })],
  },
  { slug: "wip", title: "Work in progress", position: 2, hidden: true, aliases: ["draft"], sections: [section("x", { keys: ["color.secret"] })] },
  {
    slug: "partners",
    title: "Partners",
    position: 3,
    hidden: false,
    audience: "partners",
    eyebrow: "Chapter 3",
    lede: "Terms for resellers",
    cover: SECRET_COVER,
    sections: [section("terms", { keys: ["color.secret"] })],
  },
  { slug: "partner-kit", title: "Kit", position: 4, hidden: false, parent: "partners", sections: [] },
];

const SRC: Source = {
  brand: { slug: "blender", name: "Blender" },
  rules: RULES,
  pages: PAGES,
  theme: { accent: "color.primary", device: DEVICE },
  version: null,
};

const plan = (slug: string | null, level: Level, src: Source = SRC) => planView(src, slug, { level });
function page(slug: string | null, level: Level, src?: Source) {
  const p = plan(slug, level, src);
  assert.equal(p.kind, "page");
  return p as Extract<Plan, { kind: "page" }>;
}
const ids = (p: { view: { page: { sections: Section[] } | null } }) => p.view.page?.sections.map((s) => s.id);
const keys = (p: { view: { rules: { key: string }[] } }) => [...new Set(p.view.rules.map((r) => r.key))].sort();
const BELOW: Level[] = ["everyone", "partners", "members"];

test("hidden pages leave the nav below editor; an editor keeps them", () => {
  for (const level of BELOW) assert.ok(!page(null, level).view.nav.some((n) => n.slug === "wip"), level);
  assert.ok(page(null, "editor").view.nav.some((n) => n.slug === "wip"));
});

test("a hidden page is missing below editor, by its slug or an old one", () => {
  for (const level of BELOW) {
    assert.deepEqual(plan("wip", level), { kind: "missing" }, level);
    assert.deepEqual(plan("draft", level), { kind: "missing" }, level);
  }
  assert.deepEqual(ids(page("wip", "editor")), ["x"]);
});

test("hidden sections drop below editor; an editor keeps them, flagged", () => {
  for (const level of BELOW) assert.ok(!ids(page("overview", level))!.includes("draft"), level);
  const draft = page("overview", "editor").view.page!.sections.find((s) => s.id === "draft");
  assert.equal(draft?.hidden, true);
});

test("sections above the level drop, and so do their keys and pictures", () => {
  for (const level of ["everyone", "partners"] as const) {
    const p = page("overview", level);
    assert.deepEqual(ids(p), ["intro", "dark", "swatches", "posters"], level);
    assert.ok(!keys(p).includes("tone.members"));
    assert.ok(!p.assets.includes(MEMBERS_PICTURE));
    assert.ok(!p.assets.includes(HIDDEN_PICTURE));
  }
  const members = page("overview", "members");
  assert.deepEqual(ids(members), ["intro", "inner", "dark", "swatches", "posters"]);
  assert.ok(members.assets.includes(MEMBERS_PICTURE));
  assert.ok(!members.assets.includes(HIDDEN_PICTURE));
});

test("an audience lock lists the page by title and carries nothing of it", () => {
  const p = page("partners", "everyone");
  assert.equal(p.view.page, null);
  assert.equal(p.view.locked, true);
  assert.deepEqual(p.collections, []);
  assert.ok(!keys(p).includes("color.secret"));
  assert.ok(!p.assets.includes(SECRET_COVER));
  const listed = p.view.nav.find((n) => n.slug === "partners")!;
  assert.equal(listed.locked, true);
  assert.equal(listed.title, "Partners");
  assert.deepEqual([listed.eyebrow, listed.lede, listed.cover], [null, null, null]);
  // Its child, open to everyone, is listed open.
  assert.equal(p.view.nav.find((n) => n.slug === "partner-kit")?.locked, false);
});

test("the level that reaches a page opens it", () => {
  for (const level of ["partners", "members", "editor"] as const) {
    const p = page("partners", level);
    assert.equal(p.view.locked, false, level);
    assert.deepEqual(ids(p), ["terms"]);
    assert.ok(p.assets.includes(SECRET_COVER));
    assert.equal(p.view.page?.lede, "Terms for resellers");
  }
});

test("an old slug redirects to the page; an unknown one is missing", () => {
  assert.deepEqual(plan("marks", "everyone"), { kind: "redirect", slug: "logo" });
  assert.deepEqual(plan("nope", "members"), { kind: "missing" });
  // A slug wins over another page's alias.
  const src = { ...SRC, pages: PAGES.map((p) => (p.slug === "overview" ? { ...p, aliases: ["logo"] } : p)) };
  assert.equal(page("logo", "everyone", src).view.page?.slug, "logo");
});

test("no slug is the first page the reader may open, and the home when it opens on a cover", () => {
  assert.equal(page(null, "everyone").view.page?.slug, "overview");
  const locked = { ...SRC, pages: PAGES.map((p) => (p.slug === "overview" ? { ...p, audience: "members" as const } : p)) };
  assert.equal(page(null, "partners", locked).view.page?.slug, "logo");
  assert.equal(page(null, "everyone").view.nav.find((n) => n.slug === "overview")?.home, false);
  const covered = { ...SRC, pages: PAGES.map((p) => (p.slug === "overview" ? { ...p, sections: [section("c", { template: "cover" }), ...p.sections] } : p)) };
  const home = page(null, "everyone", covered);
  assert.equal(home.view.nav.find((n) => n.slug === "overview")?.home, true);
  assert.equal(home.view.page?.home, true);
});

test("rules: bound keys, the theme's, the keys specs name, in every context version", () => {
  const p = page("overview", "everyone");
  // tone.voice and color.accent are bound; color.primary is the theme's accent, color.ink its pair; type.heading the theme's face.
  assert.deepEqual(keys(p), ["color.accent", "color.ink", "color.primary", "tone.voice", "type.heading"]);
  assert.deepEqual(
    p.view.rules.filter((r) => r.key === "color.accent").map((r) => r.context),
    [null, "dark-background"],
  );
  assert.equal(p.view.rules.find((r) => r.key === "color.primary")?.label, null);
  // A locked page still wears the theme, and shows nothing it binds.
  assert.deepEqual(keys(page("partners", "everyone")), ["color.ink", "color.primary", "type.heading"]);
});

test("a cover brings every color and the logo, which it draws", () => {
  const src = { ...SRC, pages: [{ ...PAGES[0], sections: [section("c", { template: "cover" })] }] };
  assert.deepEqual(keys(page("overview", "everyone", src)), ["color.accent", "color.ink", "color.primary", "color.secret", "logo.mark", "type.heading"]);
});

test("sections for one context stay: the reader switches context on the page", () => {
  const p = page("overview", "everyone");
  assert.ok(ids(p)!.includes("dark"));
  assert.ok(ids(p)!.includes("swatches"));
});

test("asset ids: rule assets, textures, page refs, nav covers, the device and pasted pictures", () => {
  const p = page("overview", "everyone");
  for (const a of [TEXTURE, FONT, COVER, DEVICE, PASTED, PICTURE]) assert.ok(p.assets.includes(a), a);
  // Not the logo's picture: this page doesn't show it. Not a locked page's cover.
  assert.ok(!p.assets.includes(MARK));
  assert.ok(!p.assets.includes(SECRET_COVER));
  assert.ok(page("logo", "everyone").assets.includes(MARK));
  assert.equal(new Set(p.assets).size, p.assets.length);
});

test("a pages section's cards get their covers: children by default, or the pages its items link to", () => {
  const KID = id(11);
  const src = {
    ...SRC,
    pages: [
      ...PAGES.map((p) =>
        p.slug === "logo"
          ? { ...p, sections: [section("next", { template: "pages" as const })] }
          : p.slug === "overview"
            ? { ...p, sections: [section("picks", { template: "pages" as const, items: [{ link: "/logo" }, { link: "/partners" }] })] }
            : p,
      ),
      { slug: "clear-space", title: "Clear space", position: 5, hidden: false, parent: "logo", cover: KID, sections: [] },
    ],
  };
  assert.ok(page("logo", "everyone", src).assets.includes(KID));
  const picks = page("overview", "everyone", src);
  assert.ok(picks.assets.includes(COVER));
  // A locked page's card shows its title and lock, never its cover.
  assert.ok(!picks.assets.includes(SECRET_COVER));
  assert.ok(page("overview", "partners", src).assets.includes(SECRET_COVER));
});

test("collections: the collection sections the reader gets", () => {
  assert.deepEqual(
    page("overview", "everyone").collections.map((s) => s.id),
    ["posters"],
  );
  assert.deepEqual(page("logo", "everyone").collections, []);
});

test("warnings and missing keys are for editors only", () => {
  for (const level of BELOW) {
    const p = page("logo", level);
    assert.deepEqual(p.view.warnings, [], level);
    assert.deepEqual(p.view.missing, [], level);
  }
  const p = page("logo", "editor");
  assert.deepEqual(p.view.missing, ["logo.gone"]);
  assert.ok(p.view.warnings.some((w) => w.includes('no rule "logo.gone"')));
});

test("the theme is derived and graded; a pair that fell back warns editors only", () => {
  // The orange accent on the app's white is 2.84:1: links and marks lift. Its pair, the ink, reads on it.
  const { theme, warnings } = page("logo", "editor").view;
  assert.equal(theme.accent, "#e87d0d");
  assert.equal(theme.settings.accent, "color.primary");
  assert.equal(theme.device, DEVICE);
  const failed = theme.checks.filter((c) => !c.ok);
  assert.deepEqual(failed.map((c) => c.pair), ["accent text on surface", "accent on surface"]);
  for (const c of failed) assert.ok(warnings.some((w) => w.startsWith(`${c.pair}: ${c.fg} on ${c.bg}`) && w.endsWith(`${c.used} is used`)), c.pair);
  for (const level of BELOW) {
    const v = page("logo", level).view;
    assert.deepEqual(v.theme.checks, theme.checks, level);
    assert.deepEqual(v.warnings, [], level);
  }
});

test("contexts, version, context and lang pass through", () => {
  const p = planView({ ...SRC, version: { number: 3, publishedAt: "2026-09-01T00:00:00.000Z" } }, "logo", {
    level: "members",
    context: "dark-background",
    lang: "en",
  }) as Extract<Plan, { kind: "page" }>;
  assert.deepEqual(p.view.contexts, ["dark-background"]);
  assert.deepEqual(p.view.version, { number: 3, publishedAt: "2026-09-01T00:00:00.000Z" });
  assert.equal(p.view.context, "dark-background");
  assert.equal(p.view.lang, "en");
  assert.equal(p.view.theme.settings.accent, "color.primary");
});

test("a version from before pages is laid out from its rules", () => {
  for (const pages of [null, []]) {
    const p = page(null, "everyone", { ...SRC, pages });
    assert.equal(p.view.page?.slug, "overview");
    assert.ok(p.view.nav.some((n) => n.slug === "tone"));
    assert.equal(p.view.nav.find((n) => n.slug === "overview")?.home, true);
  }
});

test("a brand whose every page is hidden has nothing for readers", () => {
  const src = { ...SRC, pages: PAGES.map((p) => ({ ...p, hidden: true })) };
  assert.deepEqual(plan(null, "members", src), { kind: "missing" });
  assert.equal(page(null, "editor", src).view.page?.slug, "overview");
});

test("a context version without a label reads its default's; its own label wins", () => {
  const rules = RULES.map((r) => (r.key === "color.accent" && r.context === null ? { ...r, label: "Blender blue" } : r));
  const labels = (src: Source) =>
    page("overview", "everyone", src).view.rules.filter((r) => r.key === "color.accent").map((r) => r.label);
  assert.deepEqual(labels({ ...SRC, rules }), ["Blender blue", "Blender blue"]);
  const own = rules.map((r) => (r.key === "color.accent" && r.context ? { ...r, label: "Blue on dark" } : r));
  assert.deepEqual(labels({ ...SRC, rules: own }), ["Blender blue", "Blue on dark"]);
});
