import assert from "node:assert/strict";
import { test } from "node:test";
import { assetIds, canonical, fromFiles, sameState, toFiles, type BrandState } from "./brand-files.ts";
import { FIXTURES, type BrandBook } from "./fixtures/brand-book.ts";
import type { SnapRule } from "./history.ts";
import { PageInput, parseSections, type SnapPage } from "./pages.ts";
import { RuleInput } from "./rules.ts";

const MARK = "00000000-0000-4000-8000-000000000001";
const WORDMARK = "00000000-0000-4000-8000-000000000002";

/** A fixture as a version holds it: rules and pages parsed as the API parses them. */
function stateOf(name: string, book: BrandBook): BrandState {
  const keys: string[] = [];
  const rules: SnapRule[] = book.rules.map((raw) => {
    const r = RuleInput.parse(raw);
    if (!keys.includes(r.key)) keys.push(r.key);
    return {
      key: r.key,
      context: r.context ?? null,
      type: r.type,
      value: r.value,
      usage: r.usage || null,
      position: keys.indexOf(r.key),
      assets: (r.assets ?? []).map((a) => ({ id: a.id, rendition: a.rendition ?? null })),
      ...(r.label && { label: r.label }),
      ...("spec" in r && r.spec && { spec: r.spec }),
    };
  });
  const pages: SnapPage[] = book.pages.map(({ slug, ...raw }, position) => {
    const p = PageInput.parse(raw);
    const { sections, errors } = parseSections(raw.sections);
    assert.deepEqual(errors, [], `${name}/${slug}`);
    return {
      slug,
      title: p.title,
      position,
      hidden: p.hidden ?? false,
      sections,
      ...(p.parent && { parent: p.parent }),
      ...(p.eyebrow && { eyebrow: p.eyebrow }),
      ...(p.lede && { lede: p.lede }),
      ...(p.cover && { cover: p.cover }),
      ...(p.icon && { icon: p.icon }),
      ...(p.audience && p.audience !== "everyone" && { audience: p.audience }),
      ...(p.tabs && { tabs: true as const }),
      ...(p.layout === "landing" && { layout: "landing" as const }),
      ...(p.translations && { translations: p.translations }),
    };
  });
  return { name, theme: book.theme, rules, pages };
}

const blender = () => stateOf("Blender", FIXTURES.blender());

// big has a page of more sections than the API takes: it is for the renderers, not for writing.
for (const [name, make] of Object.entries(FIXTURES).filter(([n]) => n !== "big")) {
  test(`${name}: written, read and written again is the same bytes`, () => {
    const state = stateOf(name, make());
    const files = toFiles(state);
    const read = fromFiles(files);
    assert.deepEqual(read.errors, []);
    assert.deepEqual(read.missing, []);
    assert.ok(read.state);
    assert.ok(sameState(read.state, state), "reads as the brand it was written from");
    assert.deepEqual(toFiles(read.state), files);
  });
}

test("the layout: brand.yaml, a file per group of rules, a file per page", () => {
  const files = toFiles(blender());
  assert.ok(files["brand.yaml"].startsWith("# An Artbucket brand"));
  assert.ok(files["rules/color.yaml"].includes("color.primary:"));
  assert.ok(files["pages/logo.yaml"]);
  // Pages nest in brand.yaml's tree: logo-use sits under logo.
  assert.match(files["brand.yaml"], /- logo:\n\s+- logo-use/);
  for (const f of Object.keys(files)) assert.match(f, /^(brand\.yaml|rules\/[\w]+\.yaml|pages\/[a-z0-9-]+\.yaml)$/);
});

test("defaults are left out: a section says only what differs from its template", () => {
  const files = toFiles(blender());
  const logo = files["pages/logo.yaml"];
  assert.doesNotMatch(logo, /hidden: false/);
  assert.doesNotMatch(logo, /props: \{\}/);
  assert.doesNotMatch(logo, /keys: \[\]/);
});

test("section ids: the natural one is left out and comes back the same", () => {
  const s = blender();
  const page = s.pages[0];
  page.sections = page.sections.map((x, i) => ({ ...x, id: i === 0 ? x.template : `custom-${i}` }));
  const files = toFiles(s);
  const read = fromFiles(files);
  assert.deepEqual(
    read.state!.pages.find((p) => p.slug === page.slug)!.sections.map((x) => x.id),
    page.sections.map((x) => x.id),
  );
  assert.doesNotMatch(files[`pages/${page.slug}.yaml`], new RegExp(`id: ${page.sections[0].template}\\n`));
});

test("assets in the repository are written as paths and read back by what the caller uploaded", () => {
  const state = blender();
  const paths = { [MARK]: "assets/mark.svg", [WORDMARK]: "assets/wordmark.svg" };
  const files = toFiles(state, { paths });
  const all = Object.values(files).join("\n");
  assert.ok(all.includes("assets/mark.svg"));
  assert.ok(!all.includes(MARK));

  const missing = fromFiles(files);
  assert.deepEqual(missing.missing, ["assets/mark.svg", "assets/wordmark.svg"]);
  assert.equal(missing.state !== null, true, "a missing file does not stop the rest from checking");

  const read = fromFiles(files, { assets: { "./assets/mark.svg": MARK, "assets/wordmark.svg": WORDMARK } });
  assert.deepEqual(read.missing, []);
  assert.deepEqual(read.used, { "assets/mark.svg": MARK, "assets/wordmark.svg": WORDMARK });
  assert.ok(sameState(read.state!, state));
});

test("a file that says the same is kept as the person wrote it; a changed one is rewritten", () => {
  const state = blender();
  const files = toFiles(state);
  const commented: Record<string, string> = { ...files, "rules/tone.yaml": `# Our voice. Keep it short.\n${files["rules/tone.yaml"]}` };
  commented["brand.yaml"] = files["brand.yaml"].replace("name: Blender", "name: Blender # the product, not the foundation");
  const changed: BrandState = { ...state, rules: state.rules.map((r) => (r.key === "color.primary" ? { ...r, value: "#ff0000" } : r)) };
  const out = toFiles(changed, { previous: commented });
  assert.equal(out["rules/tone.yaml"], commented["rules/tone.yaml"]);
  assert.equal(out["brand.yaml"], commented["brand.yaml"]);
  assert.match(out["rules/color.yaml"], /#ff0000/);
});

test("kept with paths too: an asset named by path compares by path", () => {
  const state = blender();
  const paths = { [MARK]: "assets/mark.svg" };
  const files = toFiles(state, { paths });
  const logoRules = Object.keys(files).find((f) => files[f].includes("assets/mark.svg") && f.startsWith("rules/"))!;
  const noted = { ...files, [logoRules]: `# The marks.\n${files[logoRules]}` };
  assert.equal(toFiles(state, { paths, previous: noted })[logoRules], noted[logoRules]);
});

test("problems name the file and the line", () => {
  const files = toFiles(blender());
  files["rules/color.yaml"] = files["rules/color.yaml"].replace(/value: "#e87d0d"/, 'value: "orange"');
  const read = fromFiles(files);
  assert.equal(read.state, null);
  const e = read.errors.find((x) => x.file === "rules/color.yaml")!;
  assert.ok(e, JSON.stringify(read.errors));
  assert.match(e.message, /color\.primary\.value: Use #rrggbb/);
  const line = files["rules/color.yaml"].split("\n").findIndex((l) => l.includes('"orange"')) + 1;
  assert.equal(e.line, line);
});

test("a section that binds a rule that is not there is refused at its line", () => {
  const files = toFiles(blender());
  files["pages/color.yaml"] = files["pages/color.yaml"].replace("color.primary", "color.nope");
  const read = fromFiles(files);
  const e = read.errors.find((x) => x.file === "pages/color.yaml" && x.message.includes("color.nope"));
  assert.ok(e, JSON.stringify(read.errors));
  assert.equal(files["pages/color.yaml"].split("\n")[e.line! - 1].includes("color.nope"), true);
});

test("the tree: a page it names must have a file; a file it leaves out comes last, with a warning", () => {
  const files = toFiles(blender());
  const tree = files["brand.yaml"];
  const extra = { ...files, "brand.yaml": tree.replace("pages:\n", "pages:\n  - ghost\n") };
  assert.ok(fromFiles(extra).errors.some((e) => e.file === "brand.yaml" && e.message.includes("no file pages/ghost.yaml")));

  const loose = { ...files, "pages/extra.yaml": "title: Extra\nsections: []\n" };
  const read = fromFiles(loose);
  assert.deepEqual(read.errors, []);
  assert.ok(read.warnings.some((w) => w.file === "pages/extra.yaml"));
  assert.equal(read.state!.pages.at(-1)!.slug, "extra");
});

test("a page file can't place itself: parent is the tree's", () => {
  const files = toFiles(blender());
  files["pages/color.yaml"] = `parent: logo\n${files["pages/color.yaml"]}`;
  const e = fromFiles(files).errors.find((x) => x.file === "pages/color.yaml");
  assert.match(e!.message, /parent: set by brand.yaml's pages tree/);
  assert.equal(e!.line, 1);
});

test("rule files: order from brand.yaml, keys in any file, each (key, context) once", () => {
  const files = toFiles(blender());
  const dup = { ...files, "rules/extra.yaml": 'color.primary:\n  type: color\n  value: "#000000"\n' };
  assert.ok(fromFiles(dup).errors.some((e) => e.message.includes("also in")));
  const noValue = { ...files, "rules/extra.yaml": "extra.thing:\n  type: text\n  usage: nothing\n" };
  assert.ok(fromFiles(noValue).errors.some((e) => e.file === "rules/extra.yaml"));
});

test("context versions round-trip, and a rule with only context versions", () => {
  const s = blender();
  s.rules.push({ key: "color.only", context: "print", type: "color", value: "#123456", usage: null, position: 999, assets: [] });
  const read = fromFiles(toFiles(s));
  assert.deepEqual(read.errors, []);
  assert.ok(read.state!.rules.some((r) => r.key === "color.only" && r.context === "print"));
});

test("a page takes as many sections as the API does", () => {
  const files = toFiles(blender());
  const many = Array.from({ length: 61 }, () => "  - template: text\n    body: x\n").join("");
  files["pages/color.yaml"] = `title: Color\nsections:\n${many}`;
  assert.ok(fromFiles(files).errors.some((e) => e.file === "pages/color.yaml" && e.message.includes("61 sections")));
});

test("broken YAML is an error at its line", () => {
  const read = fromFiles({ "brand.yaml": "name: X\ntheme: [\n" });
  assert.equal(read.state, null);
  assert.equal(read.errors[0].file, "brand.yaml");
  assert.ok(read.errors[0].line);
});

test("a font stored as a bare family reads as { family }", () => {
  const s: BrandState = { name: "X", theme: {}, pages: [], rules: [{ key: "type.body", context: null, type: "font", value: "Inter", usage: null, position: 0, assets: [] }] };
  assert.deepEqual(canonical(s).rules[0].value, { family: "Inter" });
  assert.ok(sameState(fromFiles(toFiles(s)).state!, s));
});

test("assetIds finds every id a brand points at", () => {
  const ids = assetIds(blender());
  assert.ok(ids.includes(MARK));
  assert.ok(ids.includes(WORDMARK));
});

test("brand.yaml's slug names the brand the files are for; another brand refuses them", () => {
  const files = toFiles(blender(), { slug: "blender" });
  assert.match(files["brand.yaml"], /^slug: blender$/m);
  assert.deepEqual(fromFiles(files, { slug: "blender" }).errors, []);
  assert.deepEqual(fromFiles(files).errors, []);
  const e = fromFiles(files, { slug: "acme" }).errors.find((x) => x.file === "brand.yaml")!;
  assert.match(e.message, /slug: names the brand blender, not acme/);
  assert.equal(files["brand.yaml"].split("\n")[e.line! - 1], "slug: blender");
  // A brand.yaml without one gets it on the next pull.
  const without = toFiles(blender());
  assert.notEqual(toFiles(blender(), { slug: "blender", previous: without })["brand.yaml"], without["brand.yaml"]);
});

test("a word that names something on every object (constructor, toString) is read and written as the word", () => {
  const files = { "brand.yaml": "name: Acme\n", "rules/voice.yaml": "voice.tone:\n  type: text\n  label: constructor\n  value: toString\n" };
  const read = fromFiles(files, { assets: {} });
  assert.deepEqual(read.errors, []);
  assert.deepEqual([read.state?.rules[0].label, read.state?.rules[0].value], ["constructor", "toString"]);
  assert.deepEqual(read.used, {});
  assert.match(toFiles(read.state!, { paths: {} })["rules/voice.yaml"], /label: constructor\n {2}value: toString/);
});

test("a YAML alias bomb is a problem in its file, not a crash", () => {
  const bomb = ["a: &a [x, x, x, x, x, x, x, x, x, x]", ...["b", "c", "d", "e"].map((k, i) => `${k}: &${k} [${Array(10).fill(`*${"abcd"[i]}`).join(", ")}]`)].join("\n");
  const read = fromFiles({ "brand.yaml": "name: Acme\n", "rules/x.yaml": bomb });
  assert.equal(read.state, null);
  assert.equal(read.errors[0]?.file, "rules/x.yaml");
  // A file kept as written is compared the same way: a bomb there is just a file that changed.
  assert.ok(toFiles(blender(), { previous: { "brand.yaml": bomb } })["brand.yaml"].startsWith("# An Artbucket brand"));
});

test("brand.yaml: an empty slug names no brand; a page slug of digits sits in the tree as YAML reads it, a number", () => {
  assert.deepEqual(fromFiles({ "brand.yaml": "slug:\nname: Acme\n" }, { slug: "acme" }).errors, []);
  const read = fromFiles({ "brand.yaml": "name: Acme\npages:\n  - 404\n  - about:\n      - 2024\n", "pages/404.yaml": "title: Lost\n", "pages/about.yaml": "title: About\n", "pages/2024.yaml": "title: This year\n" });
  assert.deepEqual(read.errors, []);
  assert.deepEqual(read.state?.pages.map((p) => [p.slug, p.parent ?? null]), [["404", null], ["about", null], ["2024", "about"]]);
});
