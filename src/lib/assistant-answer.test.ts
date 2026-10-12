import assert from "node:assert/strict";
import { test } from "node:test";
import { inline, jsonLine, jsonLines, parseAnswer as md, placePath, plainText } from "./assistant-answer.ts";
import { assistantPlace } from "./assistant-place.ts";

const A = "6700995f-e0d8-4e6b-a64f-7abbf7ec1752";
const B = "b778186c-9853-4a68-b8d2-ffce37d8a6da";
const T = (text: string) => ({ t: "text", text });

test("Markdown: titles, both lists, links, code kept as it is", () => {
  assert.deepEqual(md("### Colors"), [{ t: "h", inline: [T("Colors")] }]);
  assert.deepEqual(md("- a\n- b\n1. one\n2. two"), [
    { t: "list", ordered: false, items: [[T("a")], [T("b")]] },
    { t: "list", ordered: true, items: [[T("one")], [T("two")]] },
  ]);
  assert.deepEqual(inline("**b** and `**not bold**`"), [{ t: "strong", children: [T("b")] }, T(" and "), { t: "code", text: "**not bold**" }]);
  assert.deepEqual(inline("See [the docs](https://artbucket.io/docs)."), [T("See "), { t: "link", href: "https://artbucket.io/docs", children: [T("the docs")] }, T(".")]);
  assert.deepEqual(inline("At https://artbucket.io/docs."), [T("At "), { t: "link", href: "https://artbucket.io/docs", children: [T("https://artbucket.io/docs")] }, T(".")]);
  assert.deepEqual(inline("an *aside* here, not 2*3*4"), [T("an "), { t: "em", children: [T("aside")] }, T(" here, not 2*3*4")]);
});

test("a table: its header, its rows, a missing cell left empty", () => {
  assert.deepEqual(md("| Asset | Rights |\n|---|:--|\n| logo.png | **Web** |\n| hero.jpg |"), [
    {
      t: "table",
      head: [[T("Asset")], [T("Rights")]],
      rows: [
        [[T("logo.png")], [{ t: "strong", children: [T("Web")] }]],
        [[T("hero.jpg")], []],
      ],
    },
  ]);
  // Without its |---| line it's only text.
  assert.deepEqual(md("| a | b |"), [{ t: "p", inline: [T("| a | b |")] }]);
});

test("a code block, to its fence; still open while it streams", () => {
  assert.deepEqual(md("```js\nconst a = '<b>';\n```\nAfter"), [{ t: "code", text: "const a = '<b>';" }, { t: "p", inline: [T("After")] }]);
  assert.deepEqual(md("```\nhalf", { streaming: true }), [{ t: "code", text: "half" }]);
});

test("notes and warnings", () => {
  assert.deepEqual(md("> one\n> two"), [{ t: "callout", warn: false, lines: [[T("one")], [T("two")]] }]);
  assert.deepEqual(md("> ⚠ Expires soon"), [{ t: "callout", warn: true, lines: [[T("Expires soon")]] }]);
});

test("an asset inline, and a grid: twelve at most, and how many more", () => {
  assert.deepEqual(inline(`Here: [[asset:${A.toUpperCase()}|logo.png]]`), [T("Here: "), { t: "asset", id: A, name: "logo.png" }]);
  assert.deepEqual(md(`[[assets:${A}|a.png;${B}|b.png]]`), [{ t: "assets", items: [{ id: A, name: "a.png" }, { id: B, name: "b.png" }], more: 0 }]);
  const many = md(`[[assets:${Array.from({ length: 14 }, () => A).join(";")}]]`)[0];
  assert.equal(many.t === "assets" && many.items.length, 12);
  assert.equal(many.t === "assets" && many.more, 2);
  // Not an id: nothing is drawn but the words.
  assert.deepEqual(md("[[assets:../keys|x]]"), [{ t: "p", inline: [T("[[assets:../keys|x]]")] }]);
});

test("a color swatch: HEX only", () => {
  assert.deepEqual(inline("Primary: [[color:#6d4aff|Violet]]"), [T("Primary: "), { t: "color", hex: "#6d4aff", name: "Violet" }]);
  assert.deepEqual(inline("[[color:#zzzzzz|x]]"), [T("[[color:#zzzzzz|x]]")]);
  assert.deepEqual(inline("[[color:#fff;background:url(x)|x]]"), [T("[[color:#fff;background:url(x)|x]]")]);
});

test("a verdict: may use, with conditions, may not", () => {
  assert.deepEqual(md("[[verdict:no|Expired on **1 Sept**]]"), [{ t: "verdict", kind: "no", why: [T("Expired on "), { t: "strong", children: [T("1 Sept")] }] }]);
  assert.deepEqual(md("[[verdict:yes]]"), [{ t: "verdict", kind: "yes", why: [] }]);
  assert.deepEqual(md("[[verdict:maybe|x]]"), [{ t: "p", inline: [T("[[verdict:maybe|x]]")] }]);
});

test("a typeface: its name, its role, the library's file to draw it with", () => {
  assert.deepEqual(md(`[[font:Fraunces|Headings|${A}]]`), [{ t: "font", family: "Fraunces", role: "Headings", asset: A }]);
  assert.deepEqual(md("[[font:Inter|Body|../x]]"), [{ t: "font", family: "Inter", role: "Body", asset: null }]);
});

test("a place in the app: only the app's own, as open_in_app takes them", () => {
  assert.equal(placePath(`asset/${A}`), `/?asset=${A}`);
  assert.equal(placePath("brand/acme"), "/brands/acme");
  assert.equal(placePath("brand/acme/rules"), "/brands/acme/rules");
  assert.equal(placePath("brand/acme/guidelines/colors"), "/brands/acme/guidelines?page=colors");
  assert.equal(placePath("review"), "/review");
  assert.equal(placePath("brand/acme/guidelines/colors/edit"), "/brands/acme/guidelines/edit?page=colors");
  assert.equal(placePath("catalog"), "/catalog");
  assert.equal(placePath(`catalog/${A}`), `/catalog?o=${A}`);
  assert.equal(placePath(`catalog/${A}/lineage`), `/catalog?o=${A}&tab=lineage`);
  assert.equal(placePath(`site/${A}`), `/sites?edit=${A}`);
  assert.equal(placePath(`site/${A}/requests`), `/sites?open=${A}`);
  assert.equal(placePath("settings"), "/settings");
  assert.equal(placePath("settings/project/fields"), "/settings/project/fields");
  assert.equal(placePath("insights/checks"), "/insights/checks");
  assert.equal(placePath("team/audit"), "/team?tab=audit");
  assert.equal(placePath("connections"), "/connections");
  for (const bad of ["brand/acme/edit", "brand/../x", "asset/x", "catalog/x", `catalog/${A}/delete`, "site/x", "settings/x/y", "settings/project/../../x", "team/keys", "insights/x", "hub", "//evil.example", "https://evil.example"]) {
    assert.equal(placePath(bad), null, bad);
  }
  assert.deepEqual(inline("[[open:review|Review]]"), [{ t: "place", path: "/review", label: "Review" }]);
  assert.deepEqual(inline("[[open:hub|BrandHub]]"), [T("BrandHub")]);
});

test("while it streams, a block not yet closed isn't shown; once written, all of it is", () => {
  assert.deepEqual(md(`Found it: [[asset:${A}|lo`, { streaming: true }), [{ t: "p", inline: [T("Found it: ")] }]);
  assert.deepEqual(md(`Done. [[verdict:no|[[asset:${A}|hero.jpg]] is lic`, { streaming: true }), [{ t: "p", inline: [T("Done. ")] }]);
  assert.deepEqual(md(`Found it: [[asset:${A}|lo`), [{ t: "p", inline: [T(`Found it: [[asset:${A}|lo`)] }]);
});

test("a block may hold another: an asset in a verdict's reason", () => {
  assert.deepEqual(md(`[[verdict:no|[[asset:${A}|hero-beach.jpg]] is licensed for the EU only.]]`), [
    { t: "verdict", kind: "no", why: [{ t: "asset", id: A, name: "hero-beach.jpg" }, T(" is licensed for the EU only.")] },
  ]);
  // A line that only starts like a block is text.
  assert.equal(md("[[verdict:no|x]] and more")[0].t, "p");
});

test("a change waiting is a block of its own", () => {
  assert.deepEqual(md("I'll do it.\n[[action:abc-1]]"), [{ t: "p", inline: [T("I'll do it.")] }, { t: "action", id: "abc-1" }]);
  assert.deepEqual(md("[[action:a b]]"), [{ t: "p", inline: [T("[[action:a b]]")] }]);
});

test("copied, the answer says its blocks in words", () => {
  const text = [
    "Our colors: [[color:#6d4aff|Violet]] and [[color:#000]].",
    `[[assets:${A}|a.png;${B}|b.png]]`,
    "[[verdict:no|Expired]]",
    `[[font:Fraunces|Headings|${A}]]`,
    "See [[open:review|Review]].",
    "[[action:abc-1]]",
  ].join("\n");
  assert.equal(plainText(text), "Our colors: Violet #6D4AFF and #000.\n- a.png\n- b.png\nMay not use: Expired\nFraunces (Headings)\nSee Review.");
});

test("a stream of JSON lines: one event a line, heartbeats and broken lines skipped, the last without its newline", async () => {
  assert.equal(jsonLine(""), null);
  assert.equal(jsonLine("{not json"), null);
  assert.equal(jsonLine("[1]"), null);
  const body = new ReadableStream({
    start(c) {
      const enc = new TextEncoder();
      for (const piece of ['{"type":"chat","id":"c1"}\n\n{"type":"te', 'xt","text":"Hi"}\n', '{"type":"done"}']) c.enqueue(enc.encode(piece));
      c.close();
    },
  });
  const seen = [];
  for await (const ev of jsonLines(new Response(body))) seen.push(ev);
  assert.deepEqual(seen, [{ type: "chat", id: "c1" }, { type: "text", text: "Hi" }, { type: "done" }]);
});

test("every place a link names is one the app goes to, as it is", () => {
  const specs = ["library", "review", "collections", "brands", "activity", "insights", "insights/activity", "insights/checks", "sites", "team", "team/sharing", "catalog", "connections", "settings", "settings/organization/usage", `asset/${A}`, "brand/acme", "brand/acme/rules", "brand/acme/guidelines/logo", "brand/acme/guidelines/logo/edit", `catalog/${A}/access`, `site/${A}`, `site/${A}/requests`];
  for (const spec of specs) {
    const path = placePath(spec);
    assert.ok(path, spec);
    assert.equal(assistantPlace(path, "https://app.example"), path, spec);
  }
});

test("facts: a key and value grid whose values hold inline blocks, up to eight rows", () => {
  const [b] = md(`[[facts:License|to [[date:2027-06-30]];Credit|[[asset:${A}|hero.jpg]], by Lena|Ortiz;Territory|EU]]`);
  assert.equal(b.t, "facts");
  if (b.t !== "facts") return;
  assert.deepEqual(b.rows.map((r) => r.label), ["License", "Credit", "Territory"]);
  assert.deepEqual(b.rows[0].value, [T("to "), { t: "date", iso: "2027-06-30", word: null }]);
  // A value's own | stays in it; a block's | and ; are the block's.
  assert.deepEqual(b.rows[1].value, [{ t: "asset", id: A, name: "hero.jpg" }, T(", by Lena|Ortiz")]);
  const nine = Array.from({ length: 9 }, (_, i) => `R${i}|v`).join(";");
  const [many] = md(`[[facts:${nine}]]`);
  assert.equal(many.t === "facts" && many.rows.length, 8);
  // Without values it falls back to its words, never brackets.
  assert.deepEqual(md("[[facts:Only a label]]"), [{ t: "p", inline: [T("Only a label")] }]);
});

test("dates: a real day, with until or since; anything else stays text", () => {
  assert.deepEqual(inline("Runs [[date:2027-06-30|until]]."), [T("Runs "), { t: "date", iso: "2027-06-30", word: "until" }, T(".")]);
  assert.deepEqual(inline("[[date:2026-10-01|since]]"), [{ t: "date", iso: "2026-10-01", word: "since" }]);
  assert.deepEqual(inline("[[date:2026-10-01|jusqu'au]]"), [{ t: "date", iso: "2026-10-01", word: null }]);
  assert.deepEqual(inline("[[date:2026-02-30]]"), [T("2026-02-30")]);
  assert.deepEqual(inline("[[date:next week]]"), [T("next week")]);
});

test("next: up to three questions to tap, only as the last line, only once the answer has ended", () => {
  const text = "Two colors.\n[[next:Open the rules;Get them as CSS;Which fonts?;A fourth]]";
  assert.deepEqual(md(text).at(-1), { t: "next", items: ["Open the rules", "Get them as CSS", "Which fonts?"] });
  assert.equal(md(text, { streaming: true }).some((b) => b.t === "next"), false);
  // Anywhere but last, it is dropped.
  assert.deepEqual(md("[[next:A;B]]\nThen words."), [{ t: "p", inline: [T("Then words.")] }]);
});

test("brand, collection and person chips; a wrong one says its name", () => {
  assert.deepEqual(inline("[[brand:northwind|Northwind Coffee]]"), [{ t: "brand", slug: "northwind", name: "Northwind Coffee" }]);
  assert.deepEqual(inline(`[[collection:${A}|Summer 2026]]`), [{ t: "collection", id: A, name: "Summer 2026" }]);
  assert.deepEqual(inline("[[person:sVqENoNdzJn6wQI849JNB1aNz7hgG0Yb|Maya Chen]]"), [{ t: "person", id: "sVqENoNdzJn6wQI849JNB1aNz7hgG0Yb", name: "Maya Chen" }]);
  assert.deepEqual(inline("[[brand:../x|Acme]]"), [T("Acme")]);
  assert.deepEqual(inline("[[collection:summer|Summer]]"), [T("Summer")]);
  assert.deepEqual(inline("[[person:a b|Maya]]"), [T("Maya")]);
});

test("a verdict holds an asset chip and a date; tables keep four columns; a warning two lines", () => {
  const [v] = md(`[[verdict:no|[[asset:${A}|hero.jpg]] licensed [[date:2027-06-30|until]], organic only.]]`);
  assert.equal(v.t, "verdict");
  if (v.t === "verdict") assert.deepEqual(v.why.map((n) => n.t), ["asset", "text", "date", "text"]);
  const [t] = md("| a | b | c | d | e |\n|---|---|---|---|---|\n| 1 | 2 | 3 | 4 | 5 |");
  assert.equal(t.t === "table" && t.head.length, 4);
  assert.equal(t.t === "table" && t.rows[0].length, 4);
  const [w] = md("> ⚠ one\n> two\n> three");
  assert.equal(w.t === "callout" && w.lines.length, 2);
});

test("streaming: a half-written facts line isn't drawn until it closes", () => {
  assert.deepEqual(md("Two rows.\n[[facts:License|to [[date:2027-", { streaming: true }), [{ t: "p", inline: [T("Two rows.")] }]);
});

test("the answer to copy says the new blocks in words, and leaves the questions to tap out", () => {
  const text = `May it run?\n[[facts:License|[[date:2027-06-30|until]];Brand|[[brand:northwind|Northwind]];Who|[[person:u1|Maya Chen]]]]\n[[next:Find another;Ask the holder]]`;
  assert.equal(plainText(text), "May it run?\nLicense: until 2027-06-30\nBrand: Northwind\nWho: Maya Chen");
});

test("a table's cells split outside blocks: a chip in a cell keeps its name", () => {
  const [t] = md("| Person | Access |\n|---|---|\n| [[person:u_1|Maya Chen]] | Admin |");
  assert.equal(t.t, "table");
  if (t.t === "table") assert.deepEqual(t.rows[0], [[{ t: "person", id: "u_1", name: "Maya Chen" }], [T("Admin")]]);
});
