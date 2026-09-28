import { Marked, Renderer, type Tokens } from "marked";

/**
 * A rule's text and notes are Markdown (GFM: headings, lists, quotes, code,
 * tables, images, dividers), and so are a page's bodies and asides. Agents
 * read the Markdown as is; the page shows it as HTML, rendered here so the
 * server can send it ready to read.
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

/** A link inside a brand: a page (/logo), a section of one (/logo#clear-space), or of this page (#clear-space). */
export const SITE_PATH = /^(?:\/([a-z0-9]+(?:-[a-z0-9]+)*))?(?:#([a-z0-9_-]{1,40}))?$/i;

const isSite = (href: string) => {
  const m = SITE_PATH.exec(href);
  return Boolean(m && (m[1] || m[2]));
};

/** GitHub's alerts: a quote that opens with [!NOTE] on its own line. */
const ALERT = /^\[!(note|tip|important|warning|caution)\][ \t]*(?:\n|$)/i;
type Alert = Tokens.Blockquote & { alert?: string };

// Where site links point for the parse under way. Parsing is synchronous, so no other render can see it.
let base: ((path: string) => string) | undefined;

const make = (demote: number) =>
  new Marked({
    gfm: true,
    walkTokens(t) {
      if ((t.type === "link" || t.type === "image") && !safeUrl((t as Tokens.Link).href)) (t as Tokens.Link).href = "#";
      if (t.type !== "blockquote") return;
      // Strip the marker before the quote's own tokens are walked, so the rest renders as usual.
      const p = (t as Tokens.Blockquote).tokens[0] as Tokens.Paragraph | undefined;
      const m = p?.type === "paragraph" ? ALERT.exec(p.text) : null;
      const first = m ? (p!.tokens[0] as Tokens.Text | undefined) : undefined;
      if (!m || first?.type !== "text" || !ALERT.test(first.text)) return;
      (t as Alert).alert = m[1].toLowerCase();
      first.text = first.raw = first.text.replace(ALERT, "");
      if (!p!.text.replace(ALERT, "").trim()) (t as Tokens.Blockquote).tokens.shift();
    },
    renderer: {
      html: ({ text }) => escape(text),
      heading({ tokens, depth }) {
        const d = Math.min(depth + demote, 6);
        return `<h${d}>${this.parser.parseInline(tokens)}</h${d}>`;
      },
      link({ href, title, tokens }) {
        const external = /^\s*https?:/i.test(href);
        const to = base && isSite(href) ? base(href) : href;
        return `<a href="${escape(to)}"${title ? ` title="${escape(title)}"` : ""}${external ? ' target="_blank" rel="noreferrer"' : ""}>${this.parser.parseInline(tokens)}</a>`;
      },
      blockquote(t) {
        const tone = (t as Alert).alert;
        if (!tone) return false;
        const name = tone[0].toUpperCase() + tone.slice(1);
        return `<aside class="callout" data-tone="${tone}" role="note"><p class="callout-title">${name}</p>\n${this.parser.parse(t.tokens)}</aside>\n`;
      },
      // The Markdown component puts a copy button on each block it finds marked.
      code(t) {
        return Renderer.prototype.code.call(this, t).replace(/^<pre>/, "<pre data-copy>");
      },
      image(t) {
        return Renderer.prototype.image.call(this, t).replace(/^<img /, '<img loading="lazy" decoding="async" ');
      },
      // A wide table scrolls in its own box, not the page.
      table(t) {
        return `<div class="table-wrap">${Renderer.prototype.table.call(this, t)}</div>\n`;
      },
    },
  });

/** One per heading level: a rule's text sits two under its name, a section's body one under its title. */
const levels = [0, 1, 2, 3].map(make);

/**
 * Markdown as HTML. `demote` drops headings that many levels (true: 2, for a
 * rule's text and notes under its name); a portal's intro keeps its levels.
 * `base` says where the brand's own links go (/logo, /logo#clear-space,
 * #clear-space) on the page showing them; other links are left as written.
 */
export const renderMarkdown = (text: string, o: { demote?: number | boolean; base?: (path: string) => string } = {}) => {
  const n = o.demote === true ? 2 : Math.min(Math.max(Number(o.demote) || 0, 0), 3);
  base = o.base;
  try {
    return levels[n].parse(text, { async: false });
  } finally {
    base = undefined;
  }
};

const unescape = (s: string) =>
  s.replace(/&(lt|gt|quot|#39|amp);/g, (_, e: string) => ({ lt: "<", gt: ">", quot: '"', "#39": "'", amp: "&" })[e]!);

/** Markdown as plain text on one line, for snippets and descriptions: blocks end in a space, marks and tags go. */
export const plainText = (md: string) =>
  unescape(
    renderMarkdown(md)
      .replace(/<\/(p|h[1-6]|li|th|td|pre|blockquote|aside)>|<br>/g, " ")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim();
