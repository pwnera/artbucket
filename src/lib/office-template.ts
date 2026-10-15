import { createHash } from "node:crypto";
import { clrScheme, latinTag, type OfficeLook } from "./office.ts";

/**
 * A brand's own Office templates: a PowerPoint, Word or Excel file a designer
 * made, kept in the library and put on one of the brand's rules, as a logo
 * is. A release doesn't rewrite the file: each download wears the release
 * (retheme), the theme's twelve colors and its heading and text families in
 * every theme part, and each image that is a library asset replaced by that
 * asset's current version. Nothing else is touched: layouts, placeholders,
 * text and the designer's effects stay as made. `inspect` says what can't
 * follow the brand: colors and fonts written on shapes and runs instead of
 * taken from the theme, and images the library doesn't know.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

const CT = "application/vnd.openxmlformats-officedocument.";

/** The packages taken, by extension: Office's documents and their templates. */
export const TEMPLATE_KINDS = {
  potx: { mime: `${CT}presentationml.template`, app: "PowerPoint" },
  pptx: { mime: `${CT}presentationml.presentation`, app: "PowerPoint" },
  dotx: { mime: `${CT}wordprocessingml.template`, app: "Word" },
  docx: { mime: `${CT}wordprocessingml.document`, app: "Word" },
  xltx: { mime: `${CT}spreadsheetml.template`, app: "Excel" },
  xlsx: { mime: `${CT}spreadsheetml.sheet`, app: "Excel" },
} as const;
export type TemplateKind = keyof typeof TEMPLATE_KINDS;

/** An asset's kind of template, by its type, else its name's extension; null when it is none. */
export function templateKind(a: { mime: string; filename: string }): TemplateKind | null {
  const byMime = (Object.keys(TEMPLATE_KINDS) as TemplateKind[]).find((k) => TEMPLATE_KINDS[k].mime === a.mime);
  if (byMime) return byMime;
  const ext = /\.([a-z]{4})$/i.exec(a.filename)?.[1].toLowerCase();
  return ext && ext in TEMPLATE_KINDS ? (ext as TemplateKind) : null;
}

/** A package's theme parts: one per slide master (and notes and handouts) in PowerPoint, one in Word and Excel. */
const THEME = /^(ppt|word|xl)\/theme\/theme\d+\.xml$/;
/** Where hard-coded colors and fonts are read: slides, layouts and masters; the document, its styles, headers and footers; sheets, their styles and drawings. */
const CONTENT = /^(ppt\/(slides|slideLayouts|slideMasters)\/[^/]+\.xml|word\/(document|styles|header\d*|footer\d*)\.xml|xl\/(styles|worksheets\/[^/]+|drawings\/[^/]+)\.xml)$/;
/** Images in a package, as Office files them. */
const MEDIA = /^(ppt|word|xl)\/media\/[^/]+\.(png|jpe?g|gif|svg)$/i;

export const mediaMime = (name: string) => {
  const ext = /\.([a-z]+)$/i.exec(name)?.[1].toLowerCase();
  return ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "svg" ? "image/svg+xml" : `image/${ext}`;
};

export type Part = { name: string; data: Uint8Array };

/** A theme part wearing the look: its color scheme replaced, and the latin face of its heading (major) and text (minor) fonts. Script faces stay. */
export function rethemeXml(xml: string, look: OfficeLook) {
  return xml
    .replace(/<a:clrScheme\b[^>]*>[\s\S]*?<\/a:clrScheme>/, clrScheme(look))
    .replace(/(<a:majorFont>[\s\S]*?)<a:latin\b[^>]*\/>/, (_, before: string) => before + latinTag(look.head))
    .replace(/(<a:minorFont>[\s\S]*?)<a:latin\b[^>]*\/>/, (_, before: string) => before + latinTag(look.body));
}

const dec = new TextDecoder();
const enc = new TextEncoder();

/** The package wearing the look: every theme part rethemed, and each image in `swap` replaced by its bytes. The rest as it was, in its order. */
export function retheme(parts: Part[], look: OfficeLook, swap: Map<string, Uint8Array> = new Map()): Part[] {
  return parts.map((p) => ({ name: p.name, data: THEME.test(p.name) ? enc.encode(rethemeXml(dec.decode(p.data), look)) : (swap.get(p.name) ?? p.data) }));
}

export type TemplateCheck = {
  /** Theme parts found: none means nothing follows the brand but its images. */
  themes: number;
  /** Colors written on shapes or runs that aren't the brand's, most used first. */
  colors: { value: string; count: number }[];
  /** Faces written on shapes or runs that aren't the brand's heading or text family. */
  fonts: { name: string; count: number }[];
  /** Each image, with its SHA-256, which says whether the library has it. */
  images: { name: string; sha256: string }[];
};

const tally = (xs: string[]) =>
  [...xs.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);

/**
 * What in a package won't follow a release. `allowed` is every color of the
 * brand ("#rrggbb", any case): a hard-coded color that is one of them is the
 * brand's, if not tied to it. Theme references (`schemeClr`, `+mj-lt`,
 * `asciiTheme`) follow by themselves and aren't counted.
 */
export function inspect(parts: Part[], look: OfficeLook, allowed: string[] = []): TemplateCheck {
  const ours = new Set([...Object.values(look.colors), ...allowed].map((c) => c.slice(1, 7).toUpperCase()));
  const faces = new Set([look.head.family, look.body.family]);
  const colors: string[] = [];
  const fonts: string[] = [];
  for (const p of parts.filter((p) => CONTENT.test(p.name))) {
    const xml = dec.decode(p.data);
    for (const m of xml.matchAll(/<a:srgbClr val="([0-9A-Fa-f]{6})"|<w:color w:val="([0-9A-Fa-f]{6})"|<color rgb="(?:[0-9A-Fa-f]{2})?([0-9A-Fa-f]{6})"/g)) {
      const c = (m[1] ?? m[2] ?? m[3]).toUpperCase();
      if (!ours.has(c)) colors.push(`#${c}`);
    }
    for (const m of xml.matchAll(/<a:latin typeface="([^"]*)"|<w:rFonts\b[^>]*?w:ascii="([^"]*)"|<name val="([^"]*)"/g)) {
      const f = m[1] ?? m[2] ?? m[3];
      if (f && !f.startsWith("+") && !faces.has(f)) fonts.push(f);
    }
  }
  return {
    themes: parts.filter((p) => THEME.test(p.name)).length,
    colors: tally(colors).map(([value, count]) => ({ value, count })),
    fonts: tally(fonts).map(([name, count]) => ({ name, count })),
    images: parts.filter((p) => MEDIA.test(p.name)).map((p) => ({ name: p.name, sha256: createHash("sha256").update(p.data).digest("hex") })),
  };
}
