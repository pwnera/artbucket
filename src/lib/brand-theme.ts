import { z } from "zod";
import { APP_BG, contrast, inkOn, isHex, lift, luminance, mix, rgb } from "./color.ts";
import { fontFace, fontFiles, googleFontsCss, pickFace } from "./font.ts";
import { LANG, type Section } from "./pages.ts";
import { type COLOR_SPEC, type FONT_SPEC, fontValue, type Rule, type RuleAsset, ruleKey } from "./rules.ts";

/**
 * What a brand's guidelines page is set in: its own accent and faces, read
 * from its rules. The page wears the brand; the app around it doesn't.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

/** A font file as @font-face needs it: its name says its weight and style (fontStyle), its mime its format. */
export type FaceFile = Pick<RuleAsset, "id" | "filename" | "mime">;
export type ThemeFace = {
  family: string;
  weight?: number;
  /** A font file among the rule's assets, to load. */
  file?: string;
  /** Every font file of the rule, one @font-face each (fontFaceCss). */
  files?: FaceFile[];
  /** spec.fallback, after the family in the stack. */
  fallback?: string;
  /** From Google Fonts, with no files here: its CSS is imported instead. */
  google?: true;
};
export type BrandTheme = {
  /** The accent, lifted to 3:1 on the app's light and dark pages, for headings' marks and icons. */
  accent?: { light: string; dark: string };
  head?: ThemeFace;
  body?: ThemeFace;
};

const slot = ruleKey.nullable().optional();
/**
 * How a brand's pages look, beyond what its rules say: which rule plays which
 * part, and the page's measure, rhythm and chrome. One flat object (D7), so a
 * PATCH merges it; every part left out is read from the rules.
 */
export const ThemeSettings = z.strictObject({
  accent: slot.describe("Color rule for links, marks and brand grounds; color.primary, brand or accent when left out"),
  accentUse: z.enum(["fill", "hairline"]).optional().describe("hairline: the accent draws rules and marks, never fills"),
  surface: slot.describe("The page ground; color.background, surface or paper when left out, else the app's"),
  panel: slot.describe("Panels and alternate sections; a step off the surface when left out"),
  dark: slot.describe("The dark ground"),
  ink: slot.describe("Text; color.ink, text or foreground when left out, else black or white by contrast"),
  muted: slot.describe("Quiet text; mixed from ink and surface when left out"),
  head: slot.describe("Font rule for headings"),
  body: slot.describe("Font rule for text"),
  label: slot.describe("Font rule for eyebrows, labels and running heads; its spec.case and spec.tracking set them"),
  logo: slot.describe("The rule whose picture is the site's mark; logo.primary, mark or wordmark when left out"),
  device: z.uuid().nullable().optional().describe("An SVG asset: the brand's symbol or pattern for covers, dividers and pattern grounds"),
  radius: z.number().int().min(0).max(40).optional().describe("Corner radius in px"),
  width: z.enum(["narrow", "normal", "wide"]).optional(),
  density: z.enum(["compact", "normal", "airy"]).optional(),
  scale: z.number().min(1.067).max(1.618).optional().describe("Heading size ratio; 1.25 when left out"),
  nav: z.enum(["sidebar", "top", "overlay"]).optional(),
  band: z.boolean().optional().describe("Every page opens on a band of the brand color; header band says the same"),
  header: z.enum(["plain", "band", "split"]).optional().describe("A page's opening: on the page, on a band of the brand color, or beside its cover"),
  separation: z.enum(["space", "hairline"]).optional().describe("Between two sections on the page's own ground: space alone, or a hairline too"),
  numbering: z.boolean().optional().describe("Number chapters and pages: 01, 01.2"),
  motion: z.enum(["none", "subtle"]).optional().describe("subtle: sections reveal as they scroll in; never with reduced motion"),
  toc: z.enum(["side", "inline", "none"]).optional().describe("On this page: a side column, a list under the page header, or hidden"),
  titles: z.enum(["medium", "large", "huge"]).optional().describe("Section titles: headings (medium), or headlines (large, huge); a section's own size wins"),
  grounds: z.enum(["plain", "alternate"]).optional().describe("alternate: every other section on the page's own ground sits on the panel, so a long page has rhythm"),
  languages: z
    .array(z.strictObject({ code: LANG, label: z.string().trim().min(1).max(40), dir: z.enum(["ltr", "rtl"]).optional().describe("From the language when left out") }))
    .max(12)
    .refine((ls) => new Set(ls.map((l) => l.code)).size === ls.length, "Each language once")
    .optional()
    .describe("The languages readers pick from; the first is the one the pages are written in"),
});
export type ThemeSettings = z.output<typeof ThemeSettings>;

/** The layout settings a look sets at once: what makes two brands compose differently. Any set counts as a look chosen (readiness). */
export const LAYOUT_KEYS = ["width", "density", "scale", "radius", "nav", "toc", "header", "separation", "numbering", "motion", "titles", "grounds"] as const;
type Layout = Pick<ThemeSettings, (typeof LAYOUT_KEYS)[number]> & { band: null };

/**
 * Looks: starting points a design team would pick, each a coherent set of
 * the layout settings in one change, so one call gives a brand a grammar
 * of its own. Applied, not stored: every setting can be changed after.
 * `band` is cleared by each, since `header` says it.
 */
export const LOOKS: Record<string, { name: string; about: string; fits: string; patch: Layout }> = {
  documentation: {
    name: "Documentation",
    about: "Dense, quiet, easy to scan",
    fits: "a design system, a developer brand, a team that reads more than it looks",
    patch: { width: "normal", density: "compact", scale: 1.2, radius: 8, nav: "sidebar", toc: "side", header: "plain", band: null, numbering: false, separation: "hairline", motion: "none", titles: "medium", grounds: "plain" },
  },
  editorial: {
    name: "Editorial",
    about: "A book: airy, numbered, big titles",
    fits: "a publisher, a cultural brand, a company with a story to tell",
    patch: { width: "narrow", density: "airy", scale: 1.333, radius: 0, nav: "top", toc: "inline", header: "split", band: null, numbering: true, separation: "space", motion: "subtle", titles: "large", grounds: "plain" },
  },
  swiss: {
    name: "Swiss",
    about: "Grid, hairlines, no corners, headlines",
    fits: "a modernist or engineering brand, anything set in a grotesque",
    patch: { width: "wide", density: "compact", scale: 1.25, radius: 0, nav: "top", toc: "none", header: "plain", band: null, numbering: true, separation: "hairline", motion: "none", titles: "huge", grounds: "plain" },
  },
  bold: {
    name: "Bold",
    about: "Every chapter opens on the brand color",
    fits: "a consumer brand with a strong color, a sports or gaming brand",
    patch: { width: "wide", density: "normal", scale: 1.414, radius: 8, nav: "overlay", toc: "side", header: "band", band: null, numbering: false, separation: "space", motion: "subtle", titles: "huge", grounds: "alternate" },
  },
  cinematic: {
    name: "Cinematic",
    about: "Pictures first, dark, wide, airy",
    fits: "film, games, photography, anything with strong imagery",
    patch: { width: "wide", density: "airy", scale: 1.414, radius: 12, nav: "overlay", toc: "none", header: "split", band: null, numbering: false, separation: "space", motion: "subtle", titles: "huge", grounds: "alternate" },
  },
  playful: {
    name: "Playful",
    about: "Round, warm, alternating grounds",
    fits: "a mascot brand, a community, a product for children or makers",
    patch: { width: "normal", density: "normal", scale: 1.333, radius: 24, nav: "top", toc: "inline", header: "band", band: null, numbering: false, separation: "space", motion: "subtle", titles: "large", grounds: "alternate" },
  },
};
export const LOOK_NAMES = Object.keys(LOOKS) as [string, ...string[]];

/** A change to the settings, for set_theme and PATCH theme: a key left out keeps its value, null clears it. Core checks the merged settings whole. `look` applies a look first; the other keys win over it. */
export const ThemePatch = z.strictObject({
  ...(Object.fromEntries(Object.entries(ThemeSettings.shape).map(([k, v]) => [k, v.isNullable() ? v : v.nullable()])) as {
    [K in keyof typeof ThemeSettings.shape]: z.ZodNullable<(typeof ThemeSettings.shape)[K]>;
  }),
  look: z
    .enum(LOOK_NAMES)
    .optional()
    .describe(`A look sets the layout at once (${Object.entries(LOOKS).map(([k, l]) => `${k}: ${l.about.toLowerCase()}`).join("; ")}); keys named beside it win`),
});

/** The settings that name a rule, by the type it must be; `logo` names any rule with assets. What core checks on write. */
export const COLOR_SLOTS = ["accent", "surface", "panel", "dark", "ink", "muted"] as const;
export const FONT_SLOTS = ["head", "body", "label"] as const;
const SLOTS = [...COLOR_SLOTS, ...FONT_SLOTS, "logo"] as const;

/** The settings with rule `from` renamed `to`, so a rename never drops a mapping; null when none names `from`. */
export function renameThemeKey(s: ThemeSettings, from: string, to: string): ThemeSettings | null {
  const hit = SLOTS.filter((k) => s[k] === from);
  return hit.length ? { ...s, ...Object.fromEntries(hit.map((k) => [k, to])) } : null;
}

type R = Pick<Rule, "key" | "type" | "value" | "context" | "assets" | "spec">;

const last = (key: string) => key.split(".").pop()!;

/** The app's page backgrounds, which the accent must read on. */
const { light: LIGHT, dark: DARK } = APP_BG;

const fontSpec = (r: Pick<Rule, "spec">) => (r.spec ?? {}) as z.output<typeof FONT_SPEC>;

/** The rule as a face, with the file for its weight: a Thin or Italic file listed first is not the page's face. */
function face(r: R | undefined): ThemeFace | undefined {
  if (!r) return undefined;
  const { family, weight } = fontValue(r.value);
  const files = fontFiles(r).map(({ id, filename, mime }) => ({ id, filename, mime }));
  const file = pickFace(files, weight)?.id;
  const { fallback, source } = fontSpec(r);
  // The stack lands in a style attribute or a <style>: a fallback is font names, nothing that ends a declaration.
  const safe = fallback?.replace(/[^\w\s,"'-]/g, "").trim();
  return {
    family,
    ...(weight && { weight }),
    ...(file && { file }),
    ...(files.length && { files }),
    ...(safe && { fallback: safe }),
    ...(source === "google" && !files.length && { google: true as const }),
  };
}

const roleOf = (r: Pick<Rule, "spec">) => fontSpec(r).role;

/**
 * Which font rule sets headings, text and labels: the setting, then the rule's
 * spec.role (display or headline for headings), then the key's name, then the
 * first font (for text, the first that sets neither headings nor code). One answer for the page and for tokens (tokens.ts). A setting
 * naming no font rule (deleted, say) is passed over. Labels stop at the role:
 * without one they are the caller's to set in the text face, with its own
 * case and tracking defaults rather than another face's spec.
 */
export function fontRoles<F extends Pick<Rule, "key" | "type" | "spec">>(rules: F[], s?: ThemeSettings) {
  const fonts = rules.filter((r) => r.type === "font");
  const set = (key?: string | null) => (key ? fonts.find((r) => r.key === key) : undefined);
  const role = (...roles: string[]) => fonts.find((r) => roles.includes(roleOf(r) ?? ""));
  const named = (re: RegExp, not?: F) => fonts.find((r) => r !== not && re.test(last(r.key)));
  const head = set(s?.head) ?? role("display", "headline") ?? named(/^(head|display|title)/i) ?? fonts[0];
  // Text falls back to a face that is neither the head nor code: with a heading and a sans, the sans.
  const code = (r: F) => roleOf(r) === "code" || /mono|code/i.test(last(r.key));
  const body = set(s?.body) ?? role("body") ?? named(/^(body|text|base|primary|copy|sans|regular)/i, head) ?? fonts.find((r) => r !== head && !code(r)) ?? head;
  const label = set(s?.label) ?? role("label");
  return { head, body, label };
}

const colorsIn = (rules: R[]) => rules.filter((r) => r.type === "color" && isHex(r.value as string));
/** A color rule's hex, without its alpha. */
const solid = (r: Pick<Rule, "value">) => (r.value as string).slice(0, 7);
/** `color.primary` before `color.brand` before `color.accent`, then the first color: the order people name them. */
function accentOf(colors: R[]) {
  const named = (re: RegExp) => colors.find((r) => re.test(last(r.key)));
  return named(/^primary/i) ?? named(/^brand/i) ?? named(/^accent/i) ?? colors[0];
}

/** Default-context rules only: the page's look doesn't change as you switch context. */
export function brandTheme(rules: R[]): BrandTheme {
  const base = rules.filter((r) => r.context === null);
  const accent = accentOf(colorsIn(base));
  const hex = accent && solid(accent);
  const { head, body } = fontRoles(base);
  return {
    ...(hex && { accent: { light: lift(hex, LIGHT), dark: lift(hex, DARK) } }),
    ...(head && { head: face(head) }),
    ...(body && { body: face(body) }),
  };
}

/** One color per key (its variants are a click away on the rule), valid hex only. */
export const colorsOf = <T extends Pick<Rule, "key" | "type" | "value">>(rs: T[]) =>
  rs.filter((r, i) => r.type === "color" && isHex(r.value as string) && rs.findIndex((x) => x.key === r.key) === i);

/** A font stack: the loaded file's family first, then the name as typed, the brand's fallback, then the app's own. */
export const stack = (f: ThemeFace, loaded?: string | null) =>
  [loaded, f.family]
    .filter(Boolean)
    .map((x) => `"${x}"`)
    .concat(f.fallback ?? [], "var(--font-sans)", "sans-serif")
    .join(", ");


// ---- theme v2: the whole look, derived and graded -------------------------------

type Check = { pair: string; fg: string; bg: string; ratio: number; need: number; ok: boolean; used: string };

/** The look a brand's pages wear: its settings over what its rules say, every ink on its ground graded. */
export type Theme = {
  v1: BrandTheme;
  /** Null: no surface set or named, so the page keeps the app's ground, light or dark. */
  surface: string | null;
  panel: string;
  dark: string;
  ink: string;
  muted: string;
  onDark: string;
  mutedOnDark: string;
  /** The fill, as the brand has it: bands and buttons. */
  accent: string;
  /** The accent where it is text (links), at 4.5:1 on the surface. */
  accentText: string;
  onAccent: string;
  accentUse: "fill" | "hairline";
  line: string;
  faces: { head?: ThemeFace; body?: ThemeFace; label?: ThemeFace & { case: string; tracking: number } };
  radius: number;
  width: "narrow" | "normal" | "wide";
  density: "compact" | "normal" | "airy";
  scale: number;
  device: string | null;
  logo: { key: string } | null;
  nav: "sidebar" | "top" | "overlay";
  /** header is band: every page opens on the brand color. */
  band: boolean;
  header: "plain" | "band" | "split";
  separation: "space" | "hairline";
  numbering: boolean;
  motion: "none" | "subtle";
  toc: "side" | "inline" | "none";
  titles: "medium" | "large" | "huge";
  grounds: "plain" | "alternate";
  /** Every pair graded: `used` is `fg` when it clears `need`, else its fallback. */
  checks: Check[];
};

/** The app's violet (globals.css --primary): the accent of a brand with no colors, as its pages had before. */
const APP_ACCENT = "#6d4aff";

/** fg on bg, graded: fg when it clears `need`, else the fallback, and a row either way. */
function check(rows: Check[], pair: string, fg: string, bg: string, need: number, fallback: () => string) {
  const ratio = contrast(fg, bg);
  const ok = ratio >= need;
  const used = ok ? fg : fallback();
  rows.push({ pair, fg, bg, ratio: Math.floor(ratio * 100) / 100, need, ok, used });
  return used;
}

type Paint = { ink: string; muted: string; accentText: string; mark: string; line: string };

/** What reads on a ground, each graded there: text, quiet text, links, marks at 3:1, and hairlines. */
function paint(accent: string, bg: string, where: string, ink: string, muted: string | undefined, rows: Check[]): Paint {
  const i = check(rows, `ink on ${where}`, ink, bg, 4.5, () => inkOn(bg));
  const m = muted ?? mix(i, bg, 0.35);
  return {
    ink: i,
    muted: check(rows, `muted on ${where}`, m, bg, 4.5, () => lift(m, bg, 4.5)),
    accentText: check(rows, `accent text on ${where}`, accent, bg, 4.5, () => lift(accent, bg, 4.5)),
    mark: check(rows, `accent on ${where}`, accent, bg, 3, () => lift(accent, bg, 3)),
    line: mix(bg, i, 0.14),
  };
}

/**
 * A ground's variables: the brand's reading colors on it, and the app's
 * tokens over them (D13), so reused parts (buttons, cards, ValueEditor) wear
 * the brand with no edits. On its own color, or with a hairline accent, a
 * button is the ink.
 */
function varsOn(t: Pick<Theme, "accent" | "accentUse" | "onAccent">, bg: string, p: Paint): Record<string, string> {
  const fill = t.accentUse === "fill" && bg !== t.accent ? t.accent : p.ink;
  return {
    "--brand-ink": p.ink,
    "--brand-muted": p.muted,
    "--brand-accent-text": p.accentText,
    "--brand-accent": p.mark,
    "--brand-line": p.line,
    "--background": bg,
    "--foreground": p.ink,
    "--card": bg,
    "--card-foreground": p.ink,
    "--muted-foreground": p.muted,
    "--border": p.line,
    "--primary": fill,
    "--primary-foreground": fill === t.accent ? t.onAccent : inkOn(fill),
    "--ring": p.mark,
  };
}

const lum = (hex: string) => luminance(rgb(hex));
const colorSpec = (r: Pick<Rule, "spec"> | undefined) => (r?.spec ?? {}) as z.output<typeof COLOR_SPEC>;

/**
 * The look, from the settings and the default-context rules: an explicit
 * setting wins, a setting naming a rule that has gone is passed over, and
 * each part left out is read from the rules by the last segment of their key
 * (build spec 3.3.1). Then every ink is graded on its ground, and one that
 * fails falls back to one that reads (3.3.2): the checks say which.
 */
export function deriveTheme(rules: R[], s: ThemeSettings = {}): Theme {
  const base = rules.filter((r) => r.context === null);
  const colors = colorsIn(base);
  const set = (key?: string | null) => (key ? colors.find((r) => r.key === key) : undefined);
  const named = (...names: string[]) => colors.find((r) => names.includes(last(r.key)));
  const hex = (r: R | undefined) => (r ? solid(r) : undefined);
  const pairOf = (r: R | undefined) => hex(set(colorSpec(r).pair));
  const rows: Check[] = [];

  const accentRule = set(s.accent) ?? accentOf(colors);
  const accent = hex(accentRule) ?? APP_ACCENT;
  const surface = hex(set(s.surface) ?? named("background", "surface", "paper", "ground", "canvas")) ?? null;
  // With no surface, the grounds that need one (tint, panel) are laid on the app's light page.
  const S = surface ?? LIGHT;
  const want = hex(set(s.ink) ?? named("ink", "text", "foreground")) ?? inkOn(S);
  const p = paint(accent, S, "surface", want, hex(set(s.muted)), rows);

  const panel = hex(set(s.panel) ?? named("panel", "alt", "surface2")) ?? mix(S, p.ink, 0.04);
  check(rows, "ink on panel", p.ink, panel, 4.5, () => inkOn(panel));
  const darks = colors.filter((r) => lum(solid(r)) < 0.2);
  const darkest = darks.sort((a, b) => lum(solid(a)) - lum(solid(b)))[0];
  const darkRule = set(s.dark) ?? darks.find((r) => ["dark", "night", "navy", "black"].includes(last(r.key))) ?? darkest;
  // A brand default, not the app's page: a brand with no dark color gets a plain near-black.
  const dark = hex(darkRule) ?? "#111111";
  // Text on a fill is the color the brand pairs with it, else whichever of the page's two reads better there.
  // A stated pair that fails is worth a warning; one the brand never chose is not.
  const page = (bg: string) => (contrast(S, bg) >= contrast(p.ink, bg) ? S : p.ink);
  const onAccent = check(rows, "text on accent", pairOf(accentRule) ?? page(accent), accent, 4.5, () => inkOn(accent));
  const onDark = check(rows, "text on dark", pairOf(darkRule) ?? page(dark), dark, 4.5, () => inkOn(dark));

  const roles = fontRoles(base, s);
  const body = face(roles.body);
  // Labels in their own face take its case and tracking; without one they are the text face in capitals.
  const labelSpec = roles.label ? fontSpec(roles.label) : {};
  const tracking = labelSpec.tracking;
  const label = face(roles.label) ?? body;
  const logo = (r?: Pick<Rule, "key" | "assets">) => (r?.assets.length ? { key: r.key } : undefined);
  const logos = base.filter((r) => r.key.startsWith("logo."));
  const header = s.header ?? (s.band ? "band" : "plain");

  return {
    v1: brandTheme(rules),
    surface,
    panel,
    dark,
    ink: p.ink,
    muted: p.muted,
    onDark,
    mutedOnDark: lift(mix(onDark, dark, 0.35), dark, 4.5),
    accent,
    accentText: p.accentText,
    onAccent,
    accentUse: s.accentUse ?? "fill",
    line: p.line,
    faces: {
      ...(roles.head && { head: face(roles.head) }),
      ...(body && { body }),
      ...(label && {
        label: {
          ...label,
          case: labelSpec.case ?? "upper",
          // By size: the smallest size's, since labels are small.
          tracking: (Array.isArray(tracking) ? [...tracking].sort((a, b) => a[0] - b[0])[0][1] : tracking) ?? 0.08,
        },
      }),
    },
    radius: s.radius ?? 10,
    width: s.width ?? "normal",
    density: s.density ?? "normal",
    scale: s.scale ?? 1.25,
    device: s.device ?? null,
    logo:
      logo(base.find((r) => r.key === s.logo)) ??
      ["primary", "mark", "wordmark"].map((n) => logo(logos.find((r) => last(r.key) === n))).find(Boolean) ??
      null,
    nav: s.nav ?? "sidebar",
    band: header === "band",
    header,
    separation: s.separation ?? "space",
    numbering: s.numbering ?? false,
    motion: s.motion ?? "none",
    toc: s.toc ?? "side",
    titles: s.titles ?? "medium",
    grounds: s.grounds ?? "plain",
    checks: rows,
  };
}

/** Each failing pair in words, for the warnings of set_theme and get_page. */
export const checkWarnings = (checks: Check[]) =>
  checks.filter((c) => !c.ok).map((c) => `${c.pair}: ${c.fg} on ${c.bg} is ${c.ratio}:1, under ${c.need}:1; ${c.used} is used`);

const MEASURE = { narrow: "60ch", normal: "68ch", wide: "76ch" };
const H2_STEP = { medium: 3, large: 4, huge: 5 };
const GAP = { compact: "1rem", normal: "1.5rem", airy: "2.5rem" };
// ponytail: small caps are a font-variant, not a text-transform; they read as set until LABEL takes a variant.
const CASE: Record<string, string> = { none: "none", upper: "uppercase", lower: "lowercase", title: "capitalize", "small-caps": "none" };
const rem = (x: number) => `${Math.round(x * 1000) / 1000}rem`;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** The family its files load under (fontFaceCss): the brand's own, never a face the reader has installed. */
const loaded = (f: ThemeFace) => (f.files?.length ? `b-${slug(f.family)}` : null);

/**
 * The theme as CSS variables, for the site's root only (3.3.3); each ground
 * sets its own (sectionGround). With a surface, the app's tokens follow the
 * brand; with none, the page follows the app's light and dark, so its text
 * and lines are the app's, and the accent comes in both: LOOK picks
 * `--brand-accent` and `--brand-accent-text` from their `-l` and `-d`.
 */
export function themeVars(t: Theme, url: (id: string) => string): Record<string, string> {
  const { head, body, label } = t.faces;
  const out: Record<string, string> = {
    ...(head && { "--brand-head": stack(head, loaded(head)), "--brand-head-weight": String(head.weight ?? 600) }),
    ...(body && { "--brand-body": stack(body, loaded(body)) }),
    ...(label && { "--brand-label": stack(label, loaded(label)) }),
    "--brand-label-case": CASE[label?.case ?? "upper"] ?? "uppercase",
    "--brand-label-tracking": `${label?.tracking ?? 0.08}em`,
    "--brand-panel": t.panel,
    "--brand-dark": t.dark,
    "--brand-on-dark": t.onDark,
    "--brand-on-accent": t.onAccent,
    "--brand-radius": `${t.radius}px`,
    "--brand-measure": MEASURE[t.width],
    "--brand-gap": GAP[t.density],
    // Two steps of the scale between levels: at 1.25, 3rem titles, 2rem sections and 1.25rem subheads.
    // ponytail: a 1.618 scale makes 11rem titles; clamp them in CSS if a brand picks one.
    "--brand-h1": rem(t.scale ** 5),
    // Section titles: two steps under the h1 as headings, one as headlines, the h1's own at huge (frame.tsx H2 caps them on a phone).
    "--brand-h2": rem(t.scale ** H2_STEP[t.titles]),
    "--brand-h2-medium": rem(t.scale ** 3),
    "--brand-h2-large": rem(t.scale ** 4),
    "--brand-h2-huge": rem(t.scale ** 5),
    "--brand-h3": rem(t.scale),
    "--brand-device": t.device ? `url(${JSON.stringify(url(t.device))})` : "none",
  };
  if (t.surface) {
    const vars = varsOn(t, t.surface, paint(t.accent, t.surface, "surface", t.ink, t.muted, []));
    const mark = vars["--brand-accent"];
    return { ...out, "--brand-surface": t.surface, ...vars, "--brand-accent-l": mark, "--brand-accent-d": mark, "--radius": `${t.radius}px` };
  }
  return {
    ...out,
    "--brand-surface": "var(--background)",
    "--brand-ink": "var(--foreground)",
    "--brand-muted": "var(--muted-foreground)",
    "--brand-line": "var(--border)",
    "--brand-accent-l": lift(t.accent, LIGHT, 3),
    "--brand-accent-d": lift(t.accent, DARK, 3),
    "--brand-accent-text-l": lift(t.accent, LIGHT, 4.5),
    "--brand-accent-text-d": lift(t.accent, DARK, 4.5),
  };
}

/** The least scrim under which white text reads at 4.5:1 on a white picture: the worst an image can be. */
const SCRIM = 0.54;

export type Ground = {
  /** The ground's color; CSS mixed from the app's when it follows the app (`dark` null); null for plain, which is the page's. An image lies over it, under `scrim`. */
  background: string | null;
  /** Black over the picture, 0.54 to 0.9: the section's scrim, raised until white text reads on any picture. */
  scrim?: number;
  /** A fade from `background` into a second color, over it: tone color with background.to. */
  gradient?: string;
  /** A 2px rule along its top: the brand ground, when the accent is a hairline. */
  rule?: string;
  /** Its text is light: the ground takes class="dark" too (D13). Null: it follows the app's light or dark, as a page with no surface does. */
  dark: boolean | null;
  /** The brand's reading colors on it and the app's tokens: an inline style. */
  vars: Record<string, string>;
  checks: Check[];
};

/**
 * The panel on the app's own page, light or dark, when the theme has no
 * surface: a step toward its ink. Mixed in sRGB, as `mix` is, so the ground
 * drawn is the ground graded.
 */
const PANEL = "color-mix(in srgb, var(--foreground) 4%, var(--background))";

/** A color rule as a ground reads it: its value, and the rule its spec pairs with it. */
type ColorOf = (key: string) => Pick<Rule, "value" | "spec"> | undefined;

/**
 * A section's ground, from its tone (3.3.4), with its own ink, quiet text,
 * links, marks, lines and app tokens, graded there. Plain inherits the
 * page's. `colorOf` finds a color rule by key, in the reader's context.
 */
export function sectionGround(t: Theme, s: Pick<Section, "tone" | "background">, colorOf: ColorOf): Ground {
  const rows: Check[] = [];
  const on = (bg: string, where: string, ink: string, muted?: string): Ground => {
    const p = paint(t.accent, bg, where, ink, muted, rows);
    return { background: bg, dark: lum(p.ink) > lum(bg), vars: varsOn(t, bg, p), checks: rows };
  };
  // With no surface the page is the app's, light or dark, so a tint or a panel is laid on whichever it is,
  // in CSS, with the app's ink. Only the accent is the brand's: graded on each of the two, for LOOK to pick.
  // The tint mixes the accent itself, not var(--brand-accent), which the grading re-sets.
  const follow = (css: string, where: string, light: string, dark: string): Ground => {
    const vars: Record<string, string> = {};
    for (const [k, bg, scheme] of [["l", light, "light"], ["d", dark, "dark"]] as const) {
      vars[`--brand-accent-text-${k}`] = check(rows, `accent text on ${where}, ${scheme}`, t.accent, bg, 4.5, () => lift(t.accent, bg, 4.5));
      vars[`--brand-accent-${k}`] = check(rows, `accent on ${where}, ${scheme}`, t.accent, bg, 3, () => lift(t.accent, bg, 3));
    }
    return { background: css, dark: null, vars, checks: rows };
  };
  const panel = (where: string) =>
    t.surface ? on(t.panel, where, t.ink, t.muted) : follow(PANEL, where, mix(LIGHT, DARK, 0.04), mix(DARK, LIGHT, 0.04));
  const hexOf = (key?: string) => {
    const v = key && colorOf(key)?.value;
    return typeof v === "string" && isHex(v) ? v.slice(0, 7) : undefined;
  };
  switch (s.tone) {
    case "tint":
      if (t.surface) return on(mix(t.surface, t.accent, 0.08), "tint", t.ink, t.muted);
      return follow(`color-mix(in srgb, ${t.accent} 8%, var(--background))`, "tint", mix(LIGHT, t.accent, 0.08), mix(DARK, t.accent, 0.08));
    case "panel":
    case "pattern":
      return panel(s.tone);
    case "dark":
      return on(t.dark, "dark", t.onDark, t.mutedOnDark);
    case "brand": {
      if (t.accentUse === "fill") return on(t.accent, "accent", t.onAccent);
      const g = panel("panel");
      return { ...g, rule: g.vars["--brand-accent"] ?? "var(--brand-accent)" };
    }
    case "color": {
      const key = s.background?.color;
      const bg = hexOf(key);
      // A color that has gone since: the brand's own ground stands in.
      if (!bg) return sectionGround(t, { tone: "brand" }, colorOf);
      const pair = hexOf(colorSpec(colorOf(key!)).pair);
      const to = hexOf(s.background?.to);
      if (!to) return on(bg, key!, pair ?? inkOn(bg));
      // A fade: every color along it lies between its ends, so an ink that reads on both ends reads everywhere.
      // The one that reads best is kept, and an end it still misses is moved until it reads (a blue into an
      // orange: no ink reads on both). The ink is graded on the end it reads worse on.
      const reads = (ink: string) => Math.min(contrast(ink, bg), contrast(ink, to));
      const ink = [pair, inkOn(bg), inkOn(to)].filter((c): c is string => !!c).reduce((a, b) => (reads(b) > reads(a) ? b : a));
      const [from, into] = [bg, to].map((end) => check(rows, `fade end under text`, end, ink, 4.5, () => lift(end, ink, 4.5)));
      const worst = contrast(ink, from) <= contrast(ink, into) ? from : into;
      return {
        ...on(worst, `${key} fading into ${s.background!.to}`, ink),
        background: from,
        gradient: `linear-gradient(${s.background?.angle ?? 180}deg, ${from}, ${into})`,
      };
    }
    case "image": {
      // Graded on the worst picture, a white one under the scrim; black shows until it loads.
      const scrim = Math.max(s.background?.scrim ?? 0.45, SCRIM);
      return { ...on(mix("#ffffff", "#000000", scrim), "image", "#ffffff"), background: "#000000", scrim };
    }
    default:
      return { background: null, dark: false, vars: {}, checks: [] };
  }
}

/**
 * The theme's faces as CSS: one @font-face per file of each mapped font
 * rule, under `b-{family}` (the name its stack leads with), so print and SSR
 * show them. A Google face with no files here imports Google's CSS instead,
 * first, as @import must be.
 */
export function fontFaceCss(faces: Theme["faces"], url: (id: string) => string) {
  const imports = new Set<string>();
  const out = new Map<string, string>();
  for (const f of [faces.head, faces.body, faces.label]) {
    if (!f) continue;
    const name = loaded(f);
    for (const file of f.files ?? []) out.set(`${name} ${file.id}`, fontFace(name!, file, url));
    if (f.google) imports.add(`@import url(${JSON.stringify(`${googleFontsCss(f.family)}&display=swap`)});`);
  }
  return [...imports, ...out.values()].join("\n");
}
