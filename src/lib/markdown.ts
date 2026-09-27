import { Marked, type Tokens } from "marked";

/**
 * A rule's text and notes are Markdown (GFM: headings, lists, quotes, code,
 * tables, images, dividers). Agents read the Markdown as is; the page shows
 * it as HTML, rendered here so the server can send it ready to read.
 *
 * Anyone with a write key can set a rule's text, so the HTML is kept to what
 * Markdown makes: raw HTML is shown as text, and a link or image with any
 * scheme but http(s) or mailto goes nowhere.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Relative, or http(s) or mailto; `javascript:` and `data:` are not. */
export const safeUrl = (href: string) => !/^\s*[a-z][a-z0-9+.-]*:/i.test(href) || /^\s*(https?|mailto):/i.test(href);

const md = new Marked({
  gfm: true,
  walkTokens(t) {
    if ((t.type === "link" || t.type === "image") && !safeUrl((t as Tokens.Link).href)) (t as Tokens.Link).href = "#";
  },
  renderer: {
    html: ({ text }) => escape(text),
    link({ href, title, tokens }) {
      const external = /^\s*https?:/i.test(href);
      return `<a href="${escape(href)}"${title ? ` title="${escape(title)}"` : ""}${external ? ' target="_blank" rel="noreferrer"' : ""}>${this.parser.parseInline(tokens)}</a>`;
    },
  },
});

export const renderMarkdown = (text: string) => md.parse(text, { async: false });
