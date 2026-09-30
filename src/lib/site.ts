import type { Theme, ThemeSettings } from "./brand-theme.ts";
import type { SnapRule, Update } from "./history.ts";
import { plainText } from "./markdown.ts";
import { type Audience, boundKeys, type PageLayout, type Section, slugOfSection, type SnapPage } from "./pages.ts";
import type { Download } from "./portal.ts";
import { fontLabel, fontValue, type RuleAsset, ruleName, type RuleSpec, type RuleType, type RuleValue } from "./rules.ts";

/** A brand in the app: its Overview. */
/** A brand's page in the app, or one of its tabs by `tail` ("/releases", "/insights"). */
export const brandPath = (slug: string, tail = "") => `/brands/${encodeURIComponent(slug)}${tail}`;

const withQuery = (path: string, q: Record<string, string | null | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v) p.set(k, v);
  return `${path}${p.size ? `?${p}` : ""}`;
};

/** A brand's guidelines in the app, to read: its Guidelines tab (`page`, `context`, `lang`, `version`), or with `focus: "1"` the pages alone. */
export const guidelinesPath = (slug: string, q: Record<string, string | null | undefined> = {}) => withQuery(`${brandPath(slug)}/guidelines`, q);

/** The same guidelines in the builder, to edit (`page`, `context`); `panel` opens one of its panels. */
export const builderPath = (slug: string, q: Record<string, string | null | undefined> = {}) => withQuery(`${brandPath(slug)}/guidelines/edit`, q);

/**
 * A brand's pages as readers get them: one page at a time, with the nav of
 * every page around it, the rules it shows and the media it names, ready to
 * render. The in-app reader, the portal and the builder canvas all draw this
 * one shape (brand-sections/, site/). Also how to find one's way in it: the
 * page tree, its numbers, reading order, the pages either side, the trail
 * back up, a page's tabs, and where v1's links now land.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

// ---- the view -----------------------------------------------------------------

/** A rule's asset as a view carries it: always described. */
/** `supersededBy`: a newer version replaced it; kits and downloads skip it. */
export type ViewAsset = RuleAsset & { title: string | null; filename: string; mime: string; size: number; preview: boolean; supersededBy: string | null };

/** A rule as a page shows it, one per context version. */
export type ViewRule = {
  key: string;
  context: string | null;
  type: RuleType;
  label: string | null;
  value: RuleValue;
  usage: string | null;
  spec: RuleSpec | null;
  assets: ViewAsset[];
};

/** An asset a page names, as portal-view's PublicItem (components/public-grid.tsx) takes it. */
export type Media = {
  id: string;
  filename: string;
  title: string | null;
  description: string | null;
  creator: string | null;
  copyright: string | null;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  thumbnail: string | null;
  preview: string | null;
  original: string;
  downloads: Download[];
  /** Where a crop keeps its subject, from 0 to 1 across and down. */
  focus: { x: number; y: number } | null;
  /** An SVG drawn in one ink: it can be shown in any color (lib/icons.ts isMonochromeSvg). */
  mono?: boolean;
  updatedAt: string;
};

/** A page in the nav: enough to list, number and lock it, never its sections. */
export type NavPage = {
  slug: string;
  title: string;
  parent: string | null;
  position: number;
  icon: string | null;
  eyebrow: string | null;
  lede: string | null;
  cover: string | null;
  audience: Audience;
  tabs: boolean;
  /** The first page, when its first section is a cover: the book's home, which is never numbered. */
  home: boolean;
  /** Listed, but above the reader's level: its title shows, with a lock. */
  locked: boolean;
  updatedAt: string | null;
};

export type ViewPage = Omit<NavPage, "locked"> & { sections: Section[]; aliases: string[]; layout: PageLayout };

export type PageView = {
  brand: { slug: string; name: string };
  /** The publish it shows; null for the draft. */
  version: { number: number; publishedAt: string | null } | null;
  context: string | null;
  contexts: string[];
  lang: string | null;
  /** The look, derived from the rules and graded (brand-theme.ts deriveTheme), and the settings it came from. */
  theme: Theme & { settings: ThemeSettings };
  nav: NavPage[];
  /** Null when the page is locked for this reader. */
  page: ViewPage | null;
  locked: boolean;
  /** An alias was asked for: the page's slug now. */
  redirect?: string;
  /** Every context version of the page's bound keys, the theme's keys, and the keys their specs name. */
  rules: ViewRule[];
  /** Cover, props images and videos, backgrounds, items, the theme's device and textures, by id. */
  media: Record<string, Media>;
  /** A collection section's assets, by section id. */
  collections: Record<string, { items: Media[]; total: number; error: string | null }>;
  /** The latest publishes, newest first, when the page has an updates section: as many as its largest limit. */
  updates?: Update[];
  /** Signatures by asset id, for visitors; members' own session opens every URL. */
  signed: Record<string, string>;
  /** For editors only: what a reader would trip on, and keys with no rule. */
  warnings: string[];
  missing: string[];
};

// ---- finding the way ----------------------------------------------------------

export type NavNode = NavPage & { children: NavNode[]; number: string | null };

/**
 * The nav as a tree: siblings by position, and a page whose parent isn't
 * listed (hidden from this reader) at the top. With `numbering`, top pages
 * count 01, 02, their children 02.1 and grandchildren 02.1.3; the home counts
 * as nothing, and neither does anything under it.
 */
export function tree(pages: NavPage[], numbering: boolean): NavNode[] {
  const listed = new Set(pages.map((p) => p.slug));
  const under = (parent: string | null, prefix: string | null): NavNode[] => {
    const kids = pages
      .filter((p) => (parent === null ? p.parent === null || !listed.has(p.parent) : p.parent === parent))
      .sort((a, b) => a.position - b.position);
    let n = 0;
    return kids.map((p) => {
      // The home goes without, and so does anything under a page without.
      const counted = numbering && !p.home && (parent === null || prefix !== null);
      const number = !counted ? null : prefix ? `${prefix}.${++n}` : String(++n).padStart(2, "0");
      return { ...p, number, children: under(p.slug, number) };
    });
  };
  return under(null, null);
}

/** Every page, depth first, a tabs page's tabs too. */
export const depthFirst = (roots: NavNode[]): NavNode[] => roots.flatMap((n) => [n, ...depthFirst(n.children)]);

/** Reading order, depth first. The pages under a `tabs` page are its tabs, read with it, so they get no place of their own. */
export const order = (roots: NavNode[]): NavNode[] => roots.flatMap((n) => [n, ...(n.tabs ? [] : order(n.children))]);

/** The page's place in reading order: its own, or for a tab, its tabs page's. */
function placeOf(roots: NavNode[], slug: string): { read: NavNode[]; at: number } {
  const read = order(roots);
  const bySlug = new Map(depthFirst(roots).map((n) => [n.slug, n]));
  for (let n = bySlug.get(slug); n; n = n.parent === null ? undefined : bySlug.get(n.parent)) {
    const at = read.indexOf(n);
    if (at >= 0) return { read, at };
  }
  return { read, at: -1 };
}

/** The pages before and after in reading order, for the pager; locked pages are passed over. */
export function neighbors(roots: NavNode[], slug: string): { prev?: NavNode; next?: NavNode } {
  const { read, at } = placeOf(roots, slug);
  if (at < 0) return {};
  const open = (n: NavNode) => !n.locked;
  return { prev: read.slice(0, at).reverse().find(open), next: read.slice(at + 1).find(open) };
}

/** The breadcrumb: from the top down to the page itself. Empty for a page not in the nav. */
export function trail(roots: NavNode[], slug: string): NavNode[] {
  const bySlug = new Map(depthFirst(roots).map((n) => [n.slug, n]));
  const out: NavNode[] = [];
  for (let n = bySlug.get(slug); n; n = n.parent === null ? undefined : bySlug.get(n.parent)) out.unshift(n);
  return out;
}

/**
 * A page's sections around its tab strip: untabbed ones before the first tab
 * sit above it, untabbed ones after sit below its panel, and each tab holds its
 * sections in page order, wherever on the page they are.
 */
export function groupTabs(sections: Section[]): { before: Section[]; tabs: { name: string; sections: Section[] }[]; after: Section[] } {
  const first = sections.findIndex((s) => s.tab);
  if (first < 0) return { before: sections, tabs: [], after: [] };
  const tabs: { name: string; sections: Section[] }[] = [];
  for (const s of sections) {
    if (!s.tab) continue;
    const tab = tabs.find((t) => t.name === s.tab);
    if (tab) tab.sections.push(s);
    else tabs.push({ name: s.tab, sections: [s] });
  }
  return { before: sections.slice(0, first), tabs, after: sections.slice(first).filter((s) => !s.tab) };
}

/** The section that carries a key's `rule-{key}` anchor on a page: the first that binds it. One per page, so the id stays unique. */
export const firstBinding = (sections: Section[], key: string): string | undefined => sections.find((s) => boundKeys(s).includes(key))?.id;

/**
 * Where a v1 link lands now. `#rule-{key}`: the first page in reading order
 * that binds the key, at its first section doing so. `#section-{name}`: the
 * page initialPages made for that section of keys. Null when it's neither, or
 * lands nowhere the reader may go. `pages` are those whose sections are at hand.
 */
export function legacyAnchor(nav: NavPage[], pages: Pick<ViewPage, "slug" | "sections">[], hash: string): { page: string; section?: string } | null {
  let h = hash.replace(/^#/, "");
  try {
    h = decodeURIComponent(h);
  } catch {
    // A stray % in a pasted link: read it as written.
  }
  const open = depthFirst(tree(nav, false)).filter((n) => !n.locked);
  if (h.startsWith("rule-")) {
    const sectionsOf = new Map(pages.map((p) => [p.slug, p.sections]));
    for (const n of open) {
      const section = firstBinding(sectionsOf.get(n.slug) ?? [], h.slice("rule-".length));
      if (section) return { page: n.slug, section };
    }
  } else if (h.startsWith("section-")) {
    const slug = slugOfSection(h.slice("section-".length));
    if (open.some((n) => n.slug === slug)) return { page: slug };
  }
  return null;
}

// ---- portal paths -------------------------------------------------------------

export type Resolved = { kind: "page"; brand: string; page: string | null } | { kind: "redirect"; path: string[] } | { kind: "missing" };

/** A page's path on a portal, the one links use: the first brand's pages at the top, the others under their brand. */
export const canonicalPath = (first: string, brand: string, page: string): string[] => (brand === first ? [page] : [brand, page]);

/**
 * What a portal path shows (3.2.3): nothing, the first brand's first page;
 * one segment, a page of the first brand, else one of its old slugs
 * (redirected), else a brand's first page; two, that brand's page. A path to
 * the first brand by name redirects to its short form. `slugs`: the first
 * brand's pages the reader may reach, hidden ones left out, so a hidden page
 * never shadows a brand. Another brand's old slugs are planView's to redirect.
 * A portal with no brand has no pages: its caller shows the Assets view.
 */
export function resolvePath(path: string[], brands: string[], firstBrand: { slugs: string[]; aliases: Record<string, string> }): Resolved {
  const [first] = brands;
  const own = (slug: string): Resolved | null =>
    firstBrand.slugs.includes(slug)
      ? { kind: "page", brand: first, page: slug }
      : Object.hasOwn(firstBrand.aliases, slug)
        ? { kind: "redirect", path: [firstBrand.aliases[slug]] }
        : null;
  if (!first || path.length > 2) return { kind: "missing" };
  const [x, y] = path;
  if (x === undefined) return { kind: "page", brand: first, page: null };
  if (y === undefined) {
    return own(x) ?? (x === first ? { kind: "redirect", path: [] } : brands.includes(x) ? { kind: "page", brand: x, page: null } : { kind: "missing" });
  }
  if (x === first) {
    const r = own(y);
    return r?.kind === "page" ? { kind: "redirect", path: [y] } : (r ?? { kind: "missing" });
  }
  return brands.includes(x) ? { kind: "page", brand: x, page: y } : { kind: "missing" };
}

// ---- search -------------------------------------------------------------------

export type Hit = { kind: "page" | "section" | "rule"; page: string; section?: string; title: string; snippet: string };

type Field = { text: string; weight: number; words: string[] };
/** Words as prefixQuery splits them (search.ts): letters and digits, lowercased, 16 at most. */
const wordsOf = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
const field = (text: string | null | undefined, weight: number): Field => ({ text: text ?? "", weight, words: wordsOf(text ?? "") });

const SNIPPET = 160;
/** About 160 characters of `text`, from a little before the first word found; words are cut only where there are no spaces. */
function snippet(text: string, words: string[]) {
  if (text.length <= SNIPPET) return text;
  const at = Math.min(...words.map((w) => new RegExp(`(?<![\\p{L}\\p{N}])${w}`, "iu").exec(text)?.index ?? Infinity));
  const start = Number.isFinite(at) ? Math.max(0, Math.min(at - 40, text.length - SNIPPET)) : 0;
  const end = start + SNIPPET;
  let s = text.slice(start, end);
  if (start > 0 && /\S/.test(text[start - 1])) s = s.replace(/^\S+\s+/, "");
  if (end < text.length && /\S/.test(text[end])) s = s.replace(/\s+\S+$/, "");
  return `${start > 0 ? "\u2026" : ""}${s.trim()}${end < text.length ? "\u2026" : ""}`;
}

/** A rule's value as words: a color's hex, a font's family, a list's entries. */
function valueText(r: Pick<SnapRule, "type" | "value">) {
  if (r.type === "font") return fontLabel(fontValue(r.value));
  if (Array.isArray(r.value)) return r.value.join(", ");
  return r.type === "text" ? plainText(String(r.value)) : String(r.value);
}

/**
 * Search a brand's pages and rules, every word as a prefix (fox finds
 * foxes), each word somewhere in the same page, section or rule. A word
 * weighs what its best field does: a page title 3, a section title 2, a rule
 * 2, other text 1; hits rank by the sum, then in reading order. A rule is
 * found on the first page that shows it: `pages` are what the reader may
 * read (page-view.ts readablePages), in reading order, so a rule shown only
 * where they can't go is not found.
 * ponytail: in memory over a publish; a tsvector past about 100 pages a brand.
 */
export function searchSite(
  pages: Pick<SnapPage, "slug" | "title" | "eyebrow" | "lede" | "sections">[],
  rules: Pick<SnapRule, "key" | "type" | "value" | "label" | "context">[],
  q: string,
  limit = 20,
): Hit[] {
  const words = wordsOf(q).slice(0, 16);
  if (!words.length) return [];
  const found: { hit: Hit; score: number }[] = [];
  // The title shows as the hit's name; the snippet comes from the first other field with a word in it.
  const consider = (hit: Omit<Hit, "snippet">, fields: Field[]) => {
    let score = 0;
    for (const w of words) {
      const best = Math.max(0, ...fields.filter((f) => f.words.some((x) => x.startsWith(w))).map((f) => f.weight));
      if (!best) return;
      score += best;
    }
    const text = fields.slice(1).filter((f) => f.text);
    const where = text.find((f) => words.some((w) => f.words.some((x) => x.startsWith(w)))) ?? text[0];
    found.push({ hit: { ...hit, snippet: where ? snippet(where.text, words) : "" }, score });
  };
  for (const p of pages) {
    consider({ kind: "page", page: p.slug, title: p.title }, [field(p.title, 3), field(p.lede, 1), field(p.eyebrow, 1)]);
    for (const s of p.sections) {
      const items = (s.items ?? []).flatMap((it) => [it.title, it.text && plainText(it.text), it.caption]);
      consider({ kind: "section", page: p.slug, section: s.id, title: s.title || p.title }, [
        field(s.title, 2),
        ...[s.lede, plainText(s.body), s.aside && plainText(s.aside), ...items, s.eyebrow].map((t) => field(t, 1)),
      ]);
    }
  }
  // A rule once, with every context's value.
  for (const key of new Set(rules.map((r) => r.key))) {
    const versions = rules.filter((r) => r.key === key);
    const page = pages.find((p) => firstBinding(p.sections, key));
    if (!page) continue;
    const name = ruleName(versions.find((r) => r.context === null) ?? versions[0]);
    consider({ kind: "rule", page: page.slug, section: firstBinding(page.sections, key), title: name }, [
      field(name, 2),
      field(versions.map(valueText).join(" \u00b7 "), 2),
      field(key, 2),
    ]);
  }
  return found
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((f) => f.hit);
}

// ---- languages ----------------------------------------------------------------

/** Scripts written right to left, by their ISO 15924 code. */
const RTL = new Set(["Arab", "Hebr", "Thaa", "Syrc", "Nkoo", "Adlm", "Rohg", "Mand", "Samr"]);

/** The script a language is written in, as fonts' spec.script names it (ISO 15924: Latn, Arab, Hant). Latn when unknown. */
export function scriptOf(lang: string): string {
  try {
    return new Intl.Locale(lang).maximize().script ?? "Latn";
  } catch {
    return "Latn";
  }
}

/** Which way a language reads, from its script: ar and he right to left, ar-latn left to right. */
export const dirOf = (lang: string): "ltr" | "rtl" => (RTL.has(scriptOf(lang)) ? "rtl" : "ltr");
