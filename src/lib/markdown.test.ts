import assert from "node:assert/strict";
import { test } from "node:test";
import { linkHref, plainText, renderMarkdown, safeUrl } from "./markdown.ts";

test("Markdown: GFM renders, tables included", () => {
  const html = renderMarkdown("## Voice\n\n**Plain**, *warm*.\n\n| Do | Don't |\n|---|---|\n| Say it | Hype it |\n\n---");
  for (const bit of ["<h2>Voice</h2>", "<strong>Plain</strong>", "<em>warm</em>", "<th>Do</th>", "<td>Hype it</td>", "<hr>"])
    assert.ok(html.includes(bit), `missing ${bit}\n${html}`);
});

test("Markdown: a rule's headings drop two levels, under its name's h3; a portal intro's keep theirs", () => {
  assert.equal(renderMarkdown("## x", { demote: true }).trim(), "<h4>x</h4>");
  assert.equal(renderMarkdown("#### deep", { demote: true }).trim(), "<h6>deep</h6>");
  assert.equal(renderMarkdown("## x").trim(), "<h2>x</h2>");
});

test("Markdown: a section's body drops one level, under its h2 title; the level is a number now", () => {
  assert.equal(renderMarkdown("# x", { demote: 1 }).trim(), "<h2>x</h2>");
  assert.equal(renderMarkdown("## x", { demote: 2 }).trim(), "<h4>x</h4>");
  assert.equal(renderMarkdown("##### x", { demote: 3 }).trim(), "<h6>x</h6>");
  assert.equal(renderMarkdown("# x", { demote: false }).trim(), "<h1>x</h1>");
});

test("Markdown: the brand's own links go through base; outside links, asset links and unsafe ones don't", () => {
  const base = (p: string) => `/brand?view=read&page=${p}`;
  const html = renderMarkdown(
    "[a](/logo) [b](/logo#clear-space) [c](#palette) [d](https://acme.com) [e](/a/1/w_800) [f](javascript:alert(1)) [g](mailto:a@b.c)\n\n[ref]: /voice\n\n[h][ref]",
    { base },
  );
  for (const bit of [
    '<a href="/brand?view=read&amp;page=/logo">a</a>',
    '<a href="/brand?view=read&amp;page=/logo#clear-space">b</a>',
    '<a href="/brand?view=read&amp;page=#palette">c</a>',
    '<a href="https://acme.com" target="_blank" rel="noreferrer">d</a>',
    '<a href="/a/1/w_800">e</a>',
    '<a href="#">f</a>',
    '<a href="mailto:a@b.c">g</a>',
    '<a href="/brand?view=read&amp;page=/voice">h</a>',
  ])
    assert.ok(html.includes(bit), `missing ${bit}\n${html}`);
  // Without a base, and on the next render, links stay as written.
  assert.ok(renderMarkdown("[a](/logo)").includes('<a href="/logo">a</a>'));
});

test("Markdown: callouts, from GitHub's alert quotes", () => {
  const html = renderMarkdown("> [!WARNING]\n> Never **stretch** it.\n>\n> Scale evenly.\n\n> [!tip]\n\n> Just a quote.\n\n> [!NOTE] not on its own line");
  assert.ok(
    html.includes('<aside class="callout" data-tone="warning" role="note"><p class="callout-title">Warning</p>\n<p>Never <strong>stretch</strong> it.</p>\n<p>Scale evenly.</p>\n</aside>'),
    html,
  );
  assert.ok(html.includes('<aside class="callout" data-tone="tip" role="note"><p class="callout-title">Tip</p>\n</aside>'), html);
  assert.ok(html.includes("<blockquote>\n<p>Just a quote.</p>"), html);
  assert.ok(html.includes("<blockquote>\n<p>[!NOTE] not on its own line</p>"), html);
  assert.ok(!html.includes("[!WARNING]") && !html.includes("[!tip]"), html);
  // A quote that opens on something other than a paragraph is just a quote.
  assert.match(renderMarkdown("> ```\n> [!NOTE]\n> ```\n\n> - [!NOTE]\n\n>"), /^<blockquote>\n<pre data-copy>[^]*<blockquote>\n<ul>/);
});

test("Markdown: code is marked for its copy button, images load lazily, tables scroll in their own box", () => {
  const html = renderMarkdown("```css\n.a { color: red }\n```\n\n    indented\n\n![The mark](/a/1/w_800 \"Mark\")\n\n| a | b |\n|---|---|\n| 1 | 2 |");
  assert.ok(html.includes('<pre data-copy><code class="language-css">.a { color: red }\n</code></pre>'), html);
  assert.ok(html.includes("<pre data-copy><code>indented\n</code></pre>"), html);
  assert.ok(html.includes('<img loading="lazy" decoding="async" src="/a/1/w_800" alt="The mark" title="Mark">'), html);
  assert.match(html, /<div class="table-wrap"><table>[^]*<\/table>\n<\/div>/);
  // An unsafe image still goes nowhere, lazily.
  assert.ok(renderMarkdown("![x](data:image/svg+xml,<svg>)").includes('<img loading="lazy" decoding="async" src="#" alt="x">'));
});

test("plainText: what a snippet shows, without marks, tags or raw HTML's effect", () => {
  assert.equal(
    plainText("## Voice\n\n**Plain**, *warm* & [kind](/tone).\n\n- one\n- two\n\n> [!NOTE]\n> It's <b>ours</b>."),
    "Voice Plain, warm & kind. one two Note It's <b>ours</b>.",
  );
  assert.equal(plainText(""), "");
});

test("Markdown: raw HTML is text, and only safe links go anywhere", () => {
  const html = renderMarkdown(
    'a <script>alert(1)</script> <img src=x onerror=alert(1)>\n\n[x](javascript:alert(1)) [y](java&#115;cript:alert(1)) ![i](data:text/html,hi) [ok](https://acme.com "t") [rel](/a/1)',
  );
  assert.ok(!/<script|<img src=x|onerror=alert/.test(html.replace(/&lt;[^]*?&gt;/g, "")), html);
  assert.ok(!/href="javascript:|src="data:/i.test(html), html);
  // An entity can't sneak a scheme in: it stays escaped, so the browser reads a relative path.
  assert.ok(html.includes('href="java&amp;#115;cript:alert(1)"'), html);
  assert.ok(html.includes('<a href="https://acme.com" title="t" target="_blank" rel="noreferrer">ok</a>'), html);
  assert.ok(html.includes('<a href="/a/1">rel</a>'), html);
});

test("Links: what people paste becomes a link that goes where they meant", () => {
  assert.equal(linkHref("acme.com/brand"), "https://acme.com/brand");
  assert.equal(linkHref(" hi@acme.com "), "mailto:hi@acme.com");
  assert.equal(linkHref("https://acme.com"), "https://acme.com");
  assert.equal(linkHref("/a/1"), "/a/1");
  assert.equal(linkHref("#rule-colors"), "#rule-colors");
  assert.ok(!safeUrl(linkHref("javascript:alert(1)")));
});
