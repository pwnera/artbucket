import assert from "node:assert/strict";
import { test } from "node:test";
import { renderMarkdown } from "./markdown.ts";

test("Markdown: GFM renders, tables included", () => {
  const html = renderMarkdown("## Voice\n\n**Plain**, *warm*.\n\n| Do | Don't |\n|---|---|\n| Say it | Hype it |\n\n---");
  for (const bit of ["<h2>Voice</h2>", "<strong>Plain</strong>", "<em>warm</em>", "<th>Do</th>", "<td>Hype it</td>", "<hr>"])
    assert.ok(html.includes(bit), `missing ${bit}\n${html}`);
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
