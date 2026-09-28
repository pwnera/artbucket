import assert from "node:assert/strict";
import { test } from "node:test";
import { linkHref, localPath, renderMarkdown, safeUrl } from "./markdown.ts";

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

test("Links: a scheme hidden behind what browsers strip goes nowhere; plain links still work", () => {
  for (const bad of ["javascript:alert(1)", "JavaScript:alert(1)", " javascript:alert(1)", "java\tscript:alert(1)", "java\nscript:alert(1)", "\x01javascript:alert(1)", "\u0000javascript:alert(1)", "data:text/html,hi", "vbscript:x", "jav\rascript:alert(1)"])
    assert.ok(!safeUrl(bad), JSON.stringify(bad));
  for (const ok of ["https://acme.com", "http://acme.com/a?b#c", "mailto:hi@acme.com", "/a/1", "a/1", "#rule-colors", "?q=logo", "//acme.com"]) assert.ok(safeUrl(ok), ok);
  const html = renderMarkdown("[x](<java\tscript:alert(1)>) [y](<\x01javascript:alert(1)>)");
  assert.equal((html.match(/href="#"/g) ?? []).length, 2, html);
});

test("Paths: only this site's own, whatever a browser would make of them", () => {
  for (const ok of ["/", "/reset-password", "/invite/abc?accept=1", "/a/1#x"]) assert.ok(localPath(ok), ok);
  for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "/\t/evil.com", "/\n/evil.com", "\\/evil.com", "javascript:alert(1)", "reset", "", undefined, 1])
    assert.ok(!localPath(bad), JSON.stringify(bad));
});
