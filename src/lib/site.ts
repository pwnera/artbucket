import type { Theme, ThemeSettings } from "./brand-theme.ts";
import { type Audience, boundKeys, type Section, slugOfSection } from "./pages.ts";
import type { Download } from "./portal.ts";
import type { RuleAsset, RuleSpec, RuleType, RuleValue } from "./rules.ts";

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
export type ViewAsset = RuleAsset & { title: string | null; filename: string; mime: string; size: number; preview: boolean };

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

export type ViewPage = Omit<NavPage, "locked"> & { sections: Section[]; aliases: string[] };

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

/** Every page, depth first. */
const all = (roots: NavNode[]): NavNode[] => roots.flatMap((n) => [n, ...all(n.children)]);

/** Reading order, depth first. The pages under a `tabs` page are its tabs, read with it, so they get no place of their own. */
export const order = (roots: NavNode[]): NavNode[] => roots.flatMap((n) => [n, ...(n.tabs ? [] : order(n.children))]);

/** The page's place in reading order: its own, or for a tab, its tabs page's. */
function placeOf(roots: NavNode[], slug: string): { read: NavNode[]; at: number } {
  const read = order(roots);
  const bySlug = new Map(all(roots).map((n) => [n.slug, n]));
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
  const bySlug = new Map(all(roots).map((n) => [n.slug, n]));
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
  const open = all(tree(nav, false)).filter((n) => !n.locked);
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
