import assert from "node:assert/strict";
import { test } from "node:test";
import { inline, jsonLine, jsonLines, parseAnswer as md, placePath, plainText } from "./assistant-answer.ts";

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
  for (const bad of ["settings", "brand/acme/edit", "brand/../x", "asset/x", "//evil.example", "https://evil.example"]) assert.equal(placePath(bad), null, bad);
  assert.deepEqual(inline("[[open:review|Review]]"), [{ t: "place", path: "/review", label: "Review" }]);
  assert.deepEqual(inline("[[open:settings|Settings]]"), [T("Settings")]);
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
