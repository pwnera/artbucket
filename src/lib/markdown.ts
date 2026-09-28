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

/**
 * Relative, or http(s) or mailto; `javascript:` and `data:` are not. The URL
 * parser decides, as the browser will: it strips the tabs, newlines and
 * control characters a pattern would miss (`java\tscript:`).
 */
export const safeUrl = (href: string) => {
  try {
    return ["http:", "https:", "mailto:"].includes(new URL(href, "https://relative.invalid").protocol);
  } catch {
    return false;
  }
};

/** A path on this site, to send someone on to: never another origin, `//evil.com`, `/\evil.com` or `/\t/evil.com` included. */
export const localPath = (v: unknown): v is string => {
  if (typeof v !== "string" || !v.startsWith("/")) return false;
  try {
    return new URL(v, "https://relative.invalid").origin === "https://relative.invalid";
  } catch {
    return false;
  }
};

/**
 * What someone pastes into a link field, as a link: a scheme or a relative
 * path stays as is, an address gets mailto:, a bare domain gets https://, so
 * "acme.com/brand" doesn't become a path on this site. Check it with safeUrl.
 */
export const linkHref = (typed: string) => {
  const v = typed.trim();
  if (/^[a-z][a-z0-9+.-]*:|^[/#?.]/i.test(v)) return v;
  if (/^\S+@\S+\.\S+$/.test(v)) return `mailto:${v}`;
  if (/^\S+\.\S+/.test(v)) return `https://${v}`;
  return v;
};

const make = (demote: number) =>
  new Marked({
    gfm: true,
    walkTokens(t) {
      if ((t.type === "link" || t.type === "image") && !safeUrl((t as Tokens.Link).href)) (t as Tokens.Link).href = "#";
    },
    renderer: {
      html: ({ text }) => escape(text),
      heading({ tokens, depth }) {
        const d = Math.min(depth + demote, 6);
        return `<h${d}>${this.parser.parseInline(tokens)}</h${d}>`;
      },
      link({ href, title, tokens }) {
        const external = /^\s*https?:/i.test(href);
        return `<a href="${escape(href)}"${title ? ` title="${escape(title)}"` : ""}${external ? ' target="_blank" rel="noreferrer"' : ""}>${this.parser.parseInline(tokens)}</a>`;
      },
    },
  });

const plain = make(0);
// Two levels down, so "## " sits under a rule's own h3 name. Only the HTML; agents read "## " as written.
const demoted = make(2);

/** `demote`: for a rule's text and notes, under its name; a portal's intro keeps its levels. */
export const renderMarkdown = (text: string, { demote = false } = {}) => (demote ? demoted : plain).parse(text, { async: false });
