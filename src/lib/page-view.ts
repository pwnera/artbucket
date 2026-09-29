import { checkWarnings, COLOR_SLOTS, deriveTheme, FONT_SLOTS, fontRoles, type ThemeSettings } from "./brand-theme.ts";
import type { SnapRule } from "./history.ts";
import { assetRefs, type Audience, boundKeys, hiddenSlugs, initialPages, isLive, pageWarnings, parseSections, pickText, type Section, type SnapPage } from "./pages.ts";
import { type RuleAsset, section as keySection, specAssets, specKeys } from "./rules.ts";
import { assetIdsIn } from "./signed.ts";
import { depthFirst, type NavPage, order, type PageView, scriptOf, tree, type ViewPage, type ViewRule } from "./site.ts";

/**
 * What a reader may see of a brand's pages, decided before anything is
 * signed or even looked up: which pages they are listed and which are locked,
 * which page a slug or an old slug lands on, the sections they get in their
 * language, the rules those show and the assets to hydrate. core/page-view.ts
 * then hydrates and signs only what this lets through, so the audience filter
 * is tested here, without a database.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

/** Who reads, ranked: each sees what those before it see. An editor also sees what's hidden. */
export const LEVELS = ["everyone", "partners", "members", "editor"] as const;
export type Level = (typeof LEVELS)[number];

/** A brand as it stands in a version or the draft: what a page view is made from. */
export type Source = {
  brand: { slug: string; name: string };
  rules: SnapRule[];
  /** Null or empty: a version from before pages, laid out from its rules. */
  pages: SnapPage[] | null;
  theme: ThemeSettings;
  version: { number: number; publishedAt: string | null } | null;
};

/** A rule as planned: its assets by reference, until core describes the ones readers may see. */
export type PlannedRule = Omit<ViewRule, "assets"> & { assets: RuleAsset[] };

export type Plan =
  | { kind: "redirect"; slug: string }
  | { kind: "missing" }
  | {
      kind: "page";
      view: Omit<PageView, "media" | "collections" | "signed" | "rules"> & { rules: PlannedRule[] };
      /** Every asset the view names, to hydrate: what isn't deliverable is dropped there. */
      assets: string[];
      /** The collection sections the reader gets, to fill. */
      collections: Section[];
      /** How many publishes the page's updates sections list, the most any asks; 0 with none, so none are looked up. */
      updates: number;
    };

const rank = (l: Audience | Level) => LEVELS.indexOf(l);
const above = (audience: Audience | undefined, level: Level) => rank(audience ?? "everyone") > rank(level);

/** The sections a level gets: hidden ones for editors only (flagged by their own `hidden`), none above the level. */
const shown = (sections: Section[], level: Level) => sections.filter((s) => (level === "editor" || !s.hidden) && !above(s.audience, level));

/** The pages a level is listed: hidden ones, and every page under one, for editors only. */
function listedOf(pages: SnapPage[], level: Level) {
  if (level === "editor") return pages;
  const hidden = hiddenSlugs(pages);
  return pages.filter((p) => !hidden.has(p.slug));
}

/** The language the reader reads: the one asked for, else the one the pages are written in (the theme's first). */
const langOf = (src: Source, lang?: string | null) => lang ?? src.theme.languages?.[0]?.code ?? null;

/** Words in the reader's language. The other languages' go to editors only, who write them; readers would only carry them. */
function localize<T extends { translations?: Record<string, object> | null }>(x: T, lang: string | null, editor: boolean): T {
  const out = { ...pickText(x, lang) };
  if (!editor) delete out.translations;
  return out;
}

/** A page as the nav lists it. A locked one is listed by title, with a lock: nothing it says, not even its cover. */
const metaOf = (p: SnapPage, locked: boolean): Omit<NavPage, "locked"> => ({
  slug: p.slug,
  title: p.title,
  parent: p.parent ?? null,
  position: p.position,
  icon: p.icon ?? null,
  eyebrow: locked ? null : (p.eyebrow ?? null),
  lede: locked ? null : (p.lede ?? null),
  cover: locked ? null : (p.cover ?? null),
  audience: p.audience ?? "everyone",
  tabs: p.tabs ?? false,
  home: false,
  updatedAt: p.updatedAt ?? null,
});

/** The brand's pages, or for a version from before pages, the ones generate_pages would lay out. */
function pagesOf(src: Source): SnapPage[] {
  if (src.pages?.length) return src.pages;
  return initialPages(src.rules, src.brand.name).map((d, position) => ({
    slug: d.slug,
    title: d.title,
    position,
    hidden: false,
    sections: parseSections(d.sections, d.slug).sections,
  }));
}

/** The settings that name a rule. */
const SLOTS = [...COLOR_SLOTS, ...FONT_SLOTS, "logo"] as const;

export function planView(src: Source, slug: string | null, o: { context?: string | null; lang?: string | null; level: Level }): Plan {
  const { level } = o;
  const editor = level === "editor";
  const lang = langOf(src, o.lang);
  const pages = pagesOf(src);
  const listed = listedOf(pages, level).map((p) => localize(p, lang, editor));
  let nav: NavPage[] = listed.map((p) => ({ ...metaOf(p, above(p.audience, level)), locked: above(p.audience, level) }));
  const read = order(tree(nav, false));
  // The home: the first page, when it opens on a cover. It goes unnumbered.
  const first = read[0] && listed.find((p) => p.slug === read[0].slug);
  if (first && shown(first.sections, level)[0]?.template === "cover") nav = nav.map((n) => (n.slug === first.slug ? { ...n, home: true } : n));

  // No slug: the first page this reader may open, else the first, locked.
  const at = slug === null ? (read.find((n) => !n.locked) ?? read[0])?.slug : slug;
  const target = at === undefined ? undefined : listed.find((p) => p.slug === at);
  if (!target) {
    const now = slug === null ? undefined : listed.find((p) => p.aliases?.includes(slug));
    return now ? { kind: "redirect", slug: now.slug } : { kind: "missing" };
  }
  const locked = above(target.audience, level);
  const sections = locked ? [] : shown(target.sections, level).map((s) => localize(s, lang, editor));
  const meta = nav.find((n) => n.slug === target.slug)!;
  const page: ViewPage | null = locked
    ? null
    : { ...metaOf(target, false), home: meta.home, sections, aliases: target.aliases ?? [], layout: target.layout ?? "book" };

  // Rules: what the sections bind, what the theme names (its settings, and the faces it falls back to),
  // and for a cover, which draws the palette and the mark, every color and logo. Then the rules their specs name.
  const faces = fontRoles(src.rules.filter((r) => r.context === null));
  const cover = sections.some((s) => s.template === "cover");
  const bound = new Set([
    ...sections.flatMap(boundKeys),
    ...SLOTS.flatMap((k) => src.theme[k] ?? []),
    ...[faces.head, faces.body, faces.label].flatMap((r) => r?.key ?? []),
    ...(cover ? src.rules.filter((r) => r.type === "color" || keySection(r.key) === "logo").map((r) => r.key) : []),
    // The faces of the reader's script lead the page's stacks (look.tsx), whether or not a section shows them.
    ...(lang ? src.rules.filter((r) => r.type === "font" && (r.spec as { script?: string } | null)?.script === scriptOf(lang)).map((r) => r.key) : []),
  ]);
  const keys = new Set([...bound, ...src.rules.filter((r) => bound.has(r.key)).flatMap((r) => specKeys(r.spec))]);
  // Every context version: sections with `contexts` and `only`, and the reader's context switch, resolve on the page.
  // A label names the key: a context version without its own reads its default's.
  const labelOf = new Map(src.rules.filter((r) => r.context === null && r.label).map((r) => [r.key, r.label!]));
  const rules: PlannedRule[] = src.rules
    .filter((r) => keys.has(r.key))
    .map((r) => ({
      key: r.key,
      context: r.context,
      type: r.type,
      label: r.label ?? labelOf.get(r.key) ?? null,
      value: r.value,
      usage: r.usage,
      spec: r.spec ?? null,
      assets: r.assets.map(({ id, rendition }) => ({ id, rendition })),
    }));

  const assets = [
    ...new Set([
      ...rules.flatMap((r) => [...r.assets.map((a) => a.id), ...specAssets(r.spec)]),
      ...(page ? assetRefs(page).map((r) => r.id) : []),
      // Covers of the pages around it, for its header and its pages sections; locked ones carry none.
      ...nav.flatMap((n) => n.cover ?? []),
      ...(src.theme.device ? [src.theme.device] : []),
      // Pictures pasted into bodies, asides, items and rule text.
      ...assetIdsIn(JSON.stringify([sections, rules])),
    ]),
  ];

  const bindsNothing = (k: string) => !src.rules.some((r) => r.key === k);
  const contexts = [...new Set(src.rules.flatMap((r) => r.context ?? []))].sort();
  // Locales as contexts: a reader who asks for ar sees the rules' ar versions, when the brand has them, unless they ask for a context.
  const byLang = o.lang && [o.lang, o.lang.split("-")[0]].find((c) => contexts.includes(c));
  // Faces without their files: core names them once it knows which assets are fonts. The colors are final here.
  const theme = deriveTheme(src.rules, src.theme);
  return {
    kind: "page",
    view: {
      brand: src.brand,
      version: src.version,
      context: o.context ?? byLang ?? null,
      contexts,
      lang,
      theme: { ...theme, settings: src.theme },
      nav,
      page,
      locked,
      rules,
      // For editors only: a portal payload never carries them.
      warnings: editor ? [...pageWarnings(target, pages, src.rules), ...checkWarnings(theme.checks)] : [],
      missing: editor ? [...new Set(sections.flatMap(boundKeys))].filter(bindsNothing) : [],
    },
    assets,
    collections: sections.filter((s) => isLive(s.template)),
    updates: Math.max(0, ...sections.filter((s) => s.template === "updates").map((s) => (s.props.limit as number | undefined) ?? 5)),
  };
}

/**
 * Every page a level may open, in reading order with tabs pages' tabs, with
 * the sections it gets, in its language: what search looks through, so it
 * finds nothing on a page or in a section the reader couldn't open.
 */
export function readablePages(src: Source, o: { level: Level; lang?: string | null }): SnapPage[] {
  const editor = o.level === "editor";
  const lang = langOf(src, o.lang);
  const open = listedOf(pagesOf(src), o.level).filter((p) => !above(p.audience, o.level));
  const bySlug = new Map(open.map((p) => [p.slug, p]));
  return depthFirst(tree(open.map((p) => ({ ...metaOf(p, false), locked: false })), false)).map((n) => {
    const p = localize(bySlug.get(n.slug)!, lang, editor);
    return { ...p, sections: shown(p.sections, o.level).map((s) => localize(s, lang, editor)) };
  });
}
