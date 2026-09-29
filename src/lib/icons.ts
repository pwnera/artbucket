/**
 * Open source icon packs, through Iconify (iconify.design): its catalog of
 * sets, a set's icon names, and an icon as a standalone SVG file. Imported
 * icons are ordinary SVG assets served from /a/{id}; nothing a viewer loads
 * calls Iconify.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

export const ICONIFY = "https://api.iconify.design";

/** `tabler`, `simple-icons`, `material-symbols`: as Iconify names its sets. */
export const ICON_PREFIX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** `arrow-right`, `brand-github`: as Iconify names icons. */
export const ICON_NAME = /^[a-z0-9]+([-_][a-z0-9]+)*$/;

/** What the picker filters sets by. Each is one or more of Iconify's own categories. */
export const ICON_GROUPS = {
  Interface: ["UI 24px", "UI 16px / 32px", "UI Other / Mixed Grid", "UI Multicolor", "Material"],
  Logos: ["Logos"],
  Emoji: ["Emoji"],
  Flags: ["Flags / Maps"],
  Other: ["Programming", "Thematic"],
} as const;
export const ICON_GROUP_NAMES = Object.keys(ICON_GROUPS) as (keyof typeof ICON_GROUPS)[];
export type IconGroup = keyof typeof ICON_GROUPS;

/** Kept out of the picker: sets their authors no longer maintain. */
const ARCHIVED = "Archive / Unmaintained";

/** The sets most brands reach for, listed first; the rest follow in Iconify's order. */
const FEATURED = [
  "lucide",
  "tabler",
  "ph",
  "material-symbols",
  "heroicons",
  "simple-icons",
  "logos",
  "mdi",
  "ri",
  "carbon",
  "solar",
  "iconoir",
  "mingcute",
  "fluent",
  "bi",
  "radix-icons",
  "hugeicons",
  "lets-icons",
];

export type IconSet = {
  prefix: string;
  name: string;
  total: number;
  author: { name: string; url?: string } | null;
  license: { title: string; spdx?: string; url?: string } | null;
  /** A few of its icons' names, to show it by. */
  samples: string[];
  category: string | null;
  /** Its icons carry their own colors; false: one color, the text's. */
  palette: boolean;
  /** The grid it is drawn on, in px. */
  height: number | null;
};

type RawInfo = {
  name?: string;
  total?: number;
  author?: { name?: string; url?: string };
  license?: { title?: string; spdx?: string; url?: string };
  samples?: string[];
  category?: string;
  palette?: boolean;
  height?: number | number[];
  hidden?: boolean;
};

const setOf = (prefix: string, raw: RawInfo): IconSet => ({
  prefix,
  name: raw.name ?? prefix,
  total: raw.total ?? 0,
  author: raw.author?.name ? { name: raw.author.name, url: raw.author.url } : null,
  license: raw.license?.title ? { title: raw.license.title, spdx: raw.license.spdx, url: raw.license.url } : null,
  samples: (raw.samples ?? []).filter((s) => ICON_NAME.test(s)).slice(0, 6),
  category: raw.category ?? null,
  palette: raw.palette === true,
  height: typeof raw.height === "number" ? raw.height : Array.isArray(raw.height) ? (raw.height[0] ?? null) : null,
});

/** api.iconify.design/collections: every set Iconify serves, less hidden and unmaintained ones, featured first. */
export function parseSets(raw: string): IconSet[] {
  const all = JSON.parse(raw) as Record<string, RawInfo>;
  const sets = Object.entries(all)
    .filter(([prefix, info]) => ICON_PREFIX.test(prefix) && !info.hidden && info.category !== ARCHIVED)
    .map(([prefix, info]) => setOf(prefix, info));
  const rank = (s: IconSet) => {
    const i = FEATURED.indexOf(s.prefix);
    return i < 0 ? FEATURED.length : i;
  };
  // Array sort is stable: the rest keep Iconify's order.
  return sets.sort((a, b) => rank(a) - rank(b));
}

/** Every word of `q` in the set's name, prefix, author or license; within `group` when given. */
export function searchSets(list: IconSet[], { q = "", group }: { q?: string; group?: IconGroup }) {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const cats: readonly string[] | null = group ? ICON_GROUPS[group] : null;
  return list.filter((s) => {
    if (cats && !cats.includes(s.category ?? "")) return false;
    const hay = [s.name, s.prefix, s.author?.name, s.license?.title, s.category].join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/**
 * api.iconify.design/collection?prefix=…&info=true: the set's icon names,
 * each once, in its own order, less the hidden ones (kept for old links);
 * its categories by name, when it has them.
 */
export function parseSetIcons(raw: string) {
  const j = JSON.parse(raw) as {
    prefix?: string;
    info?: RawInfo;
    uncategorized?: string[];
    categories?: Record<string, string[]>;
    hidden?: string[];
  };
  const hidden = new Set(j.hidden ?? []);
  const seen = new Set<string>();
  const byCategory: Record<string, string[]> = {};
  for (const [cat, names] of Object.entries(j.categories ?? {})) {
    byCategory[cat] = names.filter((n) => ICON_NAME.test(n) && !hidden.has(n));
    for (const n of byCategory[cat]) seen.add(n);
  }
  for (const n of j.uncategorized ?? []) if (ICON_NAME.test(n) && !hidden.has(n)) seen.add(n);
  return {
    info: j.info && j.prefix ? setOf(j.prefix, j.info) : null,
    names: [...seen],
    categories: byCategory,
  };
}

/** Names with every word of `q` in them, those starting with the first word first; `category` narrows first. */
export function searchIcons(names: string[], { q = "", category, categories }: { q?: string; category?: string; categories?: Record<string, string[]> }) {
  const pool = category && categories?.[category] ? categories[category] : names;
  const words = q.trim().toLowerCase().split(/[\s-]+/).filter(Boolean);
  if (!words.length) return pool;
  const hits = pool.filter((n) => words.every((w) => n.includes(w)));
  const lead = (n: string) => (n.startsWith(words[0]) ? 0 : 1);
  return hits.sort((a, b) => lead(a) - lead(b));
}

/** "arrow-right-circle": "Arrow right circle", the title an imported icon gets. */
export const iconTitle = (name: string) => {
  const s = name.replace(/[-_]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// ---- icons as files -----------------------------------------------------------

type IconProps = { left?: number; top?: number; width?: number; height?: number; rotate?: number; hFlip?: boolean; vFlip?: boolean };
type RawIcon = IconProps & { body: string };
type RawAlias = IconProps & { parent: string };
/** An IconifyJSON document: api.iconify.design/{prefix}.json?icons=a,b, or a set's icons.json. */
export type IconData = IconProps & { prefix: string; icons: Record<string, RawIcon>; aliases?: Record<string, RawAlias>; not_found?: string[] };

/** An icon's body and box, its aliases followed (at most a few deep) and their turns and flips added up. */
export function resolveIcon(data: IconData, name: string) {
  let props: IconProps = {};
  let rotate = 0;
  let hFlip = false;
  let vFlip = false;
  let at = name;
  for (let depth = 0; depth < 6; depth++) {
    const icon = data.icons[at];
    const alias = icon ? null : data.aliases?.[at];
    const step: IconProps | undefined = icon ?? alias ?? undefined;
    if (!step) return null;
    // The alias nearest the name wins a box value; turns and flips stack.
    props = { left: step.left, top: step.top, width: step.width, height: step.height, ...stripUndefined(props) };
    rotate += step.rotate ?? 0;
    hFlip = hFlip !== !!step.hFlip;
    vFlip = vFlip !== !!step.vFlip;
    if (icon) {
      return {
        body: icon.body,
        left: props.left ?? data.left ?? 0,
        top: props.top ?? data.top ?? 0,
        width: props.width ?? data.width ?? 16,
        height: props.height ?? data.height ?? 16,
        rotate,
        hFlip,
        vFlip,
      };
    }
    at = alias!.parent;
  }
  return null;
}

const stripUndefined = (o: IconProps) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as IconProps;

/**
 * The icon as a file: its own width and height (not 1em, so it opens at the
 * size it was drawn at), a viewBox, and its turns and flips applied the way
 * Iconify applies them. Null when the set has no such icon.
 */
export function iconSvg(data: IconData, name: string): string | null {
  const icon = resolveIcon(data, name);
  if (!icon) return null;
  const box = { left: icon.left, top: icon.top, width: icon.width, height: icon.height };
  const transforms: string[] = [];
  let turns = icon.rotate;
  if (icon.hFlip) {
    if (icon.vFlip) turns += 2;
    else {
      transforms.push(`translate(${box.width + box.left} ${-box.top})`, "scale(-1 1)");
      box.top = box.left = 0;
    }
  } else if (icon.vFlip) {
    transforms.push(`translate(${-box.left} ${box.height + box.top})`, "scale(1 -1)");
    box.top = box.left = 0;
  }
  turns = ((turns % 4) + 4) % 4;
  if (turns === 1) {
    const c = box.height / 2 + box.top;
    transforms.unshift(`rotate(90 ${c} ${c})`);
  } else if (turns === 2) {
    transforms.unshift(`rotate(180 ${box.width / 2 + box.left} ${box.height / 2 + box.top})`);
  } else if (turns === 3) {
    const c = box.width / 2 + box.left;
    transforms.unshift(`rotate(-90 ${c} ${c})`);
  }
  if (turns % 2 === 1) {
    [box.left, box.top] = [box.top, box.left];
    [box.width, box.height] = [box.height, box.width];
  }
  const body = transforms.length ? `<g transform="${transforms.join(" ")}">${icon.body}</g>` : icon.body;
  const n = (v: number) => String(Math.round(v * 1000) / 1000);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(box.width)}" height="${n(box.height)}" ` +
    `viewBox="${n(box.left)} ${n(box.top)} ${n(box.width)} ${n(box.height)}">${body}</svg>`
  );
}

// ---- how an SVG shows ---------------------------------------------------------

/** Colors that mean "the text's color" or nothing at all. */
const INK = /^(currentcolor|none|transparent|inherit|black|#000|#000000|#000f|#000000ff)$/i;

/**
 * An SVG drawn in one ink: every fill, stroke and stop color is the text's
 * color, black or none, and it holds no picture. Such an icon can be drawn
 * in any color (a mask over the ink); one with colors of its own shows as is.
 */
export function isMonochromeSvg(svg: string): boolean {
  if (/<(image|foreignObject)\b/i.test(svg)) return false;
  // A mask's white and black cut the shape; they are not colors it shows.
  const drawn = svg.replace(/<mask\b[\s\S]*?<\/mask>/gi, "");
  const colors = [
    ...[...drawn.matchAll(/\b(?:fill|stroke|stop-color|color|flood-color|lighting-color)\s*=\s*["']([^"']*)["']/gi)].map((m) => m[1]),
    ...[...drawn.matchAll(/\b(?:fill|stroke|stop-color|color|flood-color|lighting-color)\s*:\s*([^;"'}]+)/gi)].map((m) => m[1]),
  ].map((c) => c.trim().replace(/\s*!important$/i, ""));
  // A gradient or a pattern fill (url(#…)) is colors of its own.
  return colors.every((c) => INK.test(c));
}
