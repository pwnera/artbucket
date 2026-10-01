import assert from "node:assert/strict";
import { test } from "node:test";
import { ICON_NAME, ICON_PREFIX, entityBomb, iconSvg, iconTitle, isMonochromeSvg, parseSetIcons, parseSets, resolveIcon, searchIcons, searchSets, type IconData } from "./icons.ts";

// Trimmed from api.iconify.design/collections.
const COLLECTIONS = JSON.stringify({
  "material-symbols": {
    name: "Material Symbols",
    total: 15717,
    author: { name: "Google", url: "https://github.com/google/material-design-icons" },
    license: { title: "Apache 2.0", spdx: "Apache-2.0" },
    samples: ["downloading", "privacy-tip"],
    height: 24,
    category: "Material",
    palette: false,
  },
  "old-set": { name: "Old", total: 10, category: "Archive / Unmaintained" },
  "secret-set": { name: "Secret", total: 10, hidden: true },
  tabler: {
    name: "Tabler Icons",
    total: 6220,
    author: { name: "Paweł Kuna" },
    license: { title: "MIT", spdx: "MIT" },
    samples: ["alien", "photo"],
    height: 24,
    category: "UI 24px",
    palette: false,
  },
  "twemoji": { name: "Twitter Emoji", total: 3668, license: { title: "CC BY 4.0" }, category: "Emoji", palette: true, height: [36, 72] },
  "simple-icons": { name: "Simple Icons", total: 3736, license: { title: "CC0 1.0" }, category: "Logos", palette: false, height: 24 },
});

test("the catalog drops hidden and unmaintained sets and lists the featured ones first", () => {
  const sets = parseSets(COLLECTIONS);
  assert.deepEqual(
    sets.map((s) => s.prefix),
    ["tabler", "material-symbols", "simple-icons", "twemoji"],
  );
  const tabler = sets[0];
  assert.equal(tabler.name, "Tabler Icons");
  assert.equal(tabler.license?.title, "MIT");
  assert.equal(tabler.palette, false);
  assert.equal(sets.find((s) => s.prefix === "twemoji")?.height, 36);
  assert.equal(sets.find((s) => s.prefix === "simple-icons")?.author, null);
});

test("sets are found by every word, within a group", () => {
  const sets = parseSets(COLLECTIONS);
  assert.deepEqual(searchSets(sets, { q: "google" }).map((s) => s.prefix), ["material-symbols"]);
  assert.deepEqual(searchSets(sets, { q: "icons mit" }).map((s) => s.prefix), ["tabler"]);
  assert.deepEqual(searchSets(sets, { group: "Interface" }).map((s) => s.prefix), ["tabler", "material-symbols"]);
  assert.deepEqual(searchSets(sets, { group: "Logos" }).map((s) => s.prefix), ["simple-icons"]);
  assert.equal(searchSets(sets, {}).length, 4);
});

test("a set's names come once each, hidden ones out, categories kept", () => {
  const got = parseSetIcons(
    JSON.stringify({
      prefix: "tabler",
      total: 5,
      info: { name: "Tabler Icons", total: 5, license: { title: "MIT" } },
      categories: { Arrows: ["arrow-left", "arrow-right"], Media: ["photo", "arrow-right"] },
      uncategorized: ["alien", "old-thing"],
      hidden: ["old-thing"],
    }),
  );
  assert.deepEqual(got.names, ["arrow-left", "arrow-right", "photo", "alien"]);
  assert.deepEqual(got.categories.Media, ["photo", "arrow-right"]);
  assert.equal(got.info?.name, "Tabler Icons");
});

test("icons are found by every word, those starting with it first", () => {
  const names = ["circle-arrow-right", "arrow-right", "arrow-left", "home", "arrow-right-circle"];
  assert.deepEqual(searchIcons(names, { q: "arrow right" }), ["arrow-right", "arrow-right-circle", "circle-arrow-right"]);
  assert.deepEqual(searchIcons(names, { q: "" }), names);
  assert.deepEqual(searchIcons(names, { category: "Home", categories: { Home: ["home"] } }), ["home"]);
});

test("names and prefixes are what Iconify allows", () => {
  assert.ok(ICON_PREFIX.test("simple-icons"));
  assert.ok(!ICON_PREFIX.test("../etc"));
  assert.ok(ICON_NAME.test("arrow-right"));
  assert.ok(ICON_NAME.test("24_hours"));
  assert.ok(!ICON_NAME.test("a/b"));
  assert.ok(!ICON_NAME.test("Arrow"));
  assert.equal(iconTitle("arrow-right-circle"), "Arrow right circle");
});

const DATA: IconData = {
  prefix: "tabler",
  width: 24,
  height: 24,
  icons: {
    arrow: { body: '<path d="M5 12h14"/>' },
    wide: { body: "<path/>", width: 32, left: 2 },
  },
  aliases: {
    "arrow-down": { parent: "arrow", rotate: 1 },
    "arrow-left": { parent: "arrow", hFlip: true },
    "arrow-up": { parent: "arrow-down", rotate: 2 },
    "arrow-flipped-twice": { parent: "arrow-left", hFlip: true },
    loop: { parent: "loop" },
  },
};

test("an icon is a file at its own size, with its viewBox", () => {
  assert.equal(
    iconSvg(DATA, "arrow"),
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
  );
  assert.match(iconSvg(DATA, "wide")!, /width="32" height="24" viewBox="2 0 32 24"/);
  assert.equal(iconSvg(DATA, "missing"), null);
  // An alias that points at itself ends, rather than looping.
  assert.equal(iconSvg(DATA, "loop"), null);
});

test("aliases add up their turns and flips", () => {
  assert.equal(resolveIcon(DATA, "arrow-up")?.rotate, 3);
  assert.match(iconSvg(DATA, "arrow-down")!, /<g transform="rotate\(90 12 12\)">/);
  assert.match(iconSvg(DATA, "arrow-up")!, /<g transform="rotate\(-90 12 12\)">/);
  assert.match(iconSvg(DATA, "arrow-left")!, /<g transform="translate\(24 0\) scale\(-1 1\)">/);
  // Flipped twice is not flipped.
  assert.doesNotMatch(iconSvg(DATA, "arrow-flipped-twice")!, /transform/);
});

test("an icon drawn in the text's color is monochrome; one with its own colors is not", () => {
  assert.ok(isMonochromeSvg('<svg><path fill="none" stroke="currentColor" d=""/></svg>'));
  assert.ok(isMonochromeSvg('<svg><path d=""/></svg>'));
  assert.ok(isMonochromeSvg('<svg><path fill="#000" style="stroke: currentColor"/></svg>'));
  assert.ok(isMonochromeSvg('<svg><mask id="m"><path fill="#fff"/></mask><path fill="currentColor" mask="url(#m)"/></svg>'));
  assert.ok(!isMonochromeSvg('<svg><path fill="#ff0000"/></svg>'));
  assert.ok(!isMonochromeSvg('<svg><path style="fill:#1877F2"/></svg>'));
  assert.ok(!isMonochromeSvg('<svg><path fill="url(#g)"/></svg>'));
  assert.ok(!isMonochromeSvg('<svg><image href="x.png"/></svg>'));
  assert.ok(isMonochromeSvg('<svg><path style="fill: currentColor !IMPORTANT"/></svg>'));
  assert.ok(!isMonochromeSvg('<svg><path style="fill:#f00 !important"/></svg>'));
});

test("isMonochromeSvg reads a hostile file in linear time: spaces before no !important, masks that never close", () => {
  const t = Date.now();
  isMonochromeSvg(`<svg style="fill:x${" ".repeat(200_000)}y">`);
  isMonochromeSvg("</mask>" + "<mask ".repeat(200_000));
  assert.ok(Date.now() - t < 1000, `took ${Date.now() - t}ms`);
});

test("entityBomb: nested, parameter, external or overused entities are a bomb; Illustrator's namespaces are not", () => {
  const illustrator = `<?xml version="1.0"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [
\t<!ENTITY ns_extend "http://ns.adobe.com/Extensibility/1.0/">
\t<!ENTITY ns_ai 'http://ns.adobe.com/AdobeIllustrator/10.0/'>
]>
<svg xmlns:x="&ns_extend;" xmlns:i="&ns_ai;"><path d=""/></svg>`;
  assert.equal(entityBomb(illustrator), false);
  assert.equal(entityBomb('<svg xmlns="http://www.w3.org/2000/svg"/>'), false);
  const laughs = `<!DOCTYPE svg [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]><svg>&b;</svg>`;
  assert.equal(entityBomb(laughs), true);
  assert.equal(entityBomb(`<!DOCTYPE svg [<!ENTITY % p "x">]><svg/>`), true);
  assert.equal(entityBomb(`<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg>&x;</svg>`), true);
  // Quadratic blowup: one plain entity, used until it outgrows the file a thousandfold.
  assert.equal(entityBomb(`<!DOCTYPE svg [<!ENTITY a "${"a".repeat(100_000)}">]><svg>${"&a;".repeat(200)}</svg>`), true);
  // Character references and Illustrator's style entities, used thousands of times, are not.
  assert.equal(entityBomb(`<!DOCTYPE svg [<!ENTITY nbsp "&#160;"><!ENTITY hex '&#xA0;'>]><svg><text>a&nbsp;b&hex;</text></svg>`), false);
  const styles = Array.from({ length: 300 }, (_, i) => `<!ENTITY st${i} "fill:#FFFFFF;stroke:#000000;">`).join("");
  assert.equal(entityBomb(`<!DOCTYPE svg [${styles}]><svg>${'<path style="&st1;"/>'.repeat(20_000)}</svg>`), false);
});
