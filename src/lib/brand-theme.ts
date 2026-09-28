import { z } from "zod";
import { isHex, lift } from "./color.ts";
import { fontFiles, pickFace } from "./font.ts";
import { type FONT_SPEC, fontValue, type Rule, ruleKey } from "./rules.ts";

/**
 * What a brand's guidelines page is set in: its own accent and faces, read
 * from its rules. The page wears the brand; the app around it doesn't.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

export type ThemeFace = { family: string; weight?: number; /** A font file among the rule's assets, to load. */ file?: string };
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
  band: z.boolean().optional().describe("Every page opens on a band of the brand color"),
  numbering: z.boolean().optional().describe("Number chapters and pages: 01, 01.2"),
  motion: z.enum(["none", "subtle"]).optional().describe("subtle: sections reveal as they scroll in; never with reduced motion"),
});
export type ThemeSettings = z.output<typeof ThemeSettings>;

/** A change to the settings, for set_theme and PATCH theme: a key left out keeps its value, null clears it. Core checks the merged settings whole. */
export const ThemePatch = z.strictObject(
  Object.fromEntries(Object.entries(ThemeSettings.shape).map(([k, v]) => [k, v.isNullable() ? v : v.nullable()])) as {
    [K in keyof typeof ThemeSettings.shape]: z.ZodNullable<(typeof ThemeSettings.shape)[K]>;
  },
);

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

/** The app's page backgrounds (globals.css), which the accent must read on. */
const LIGHT = "#ffffff";
const DARK = "#111111";

/** The rule as a face, with the file for its weight: a Thin or Italic file listed first is not the page's face. */
function face(r: R | undefined): ThemeFace | undefined {
  if (!r) return undefined;
  const { family, weight } = fontValue(r.value);
  const file = pickFace(fontFiles(r), weight)?.id;
  return { family, ...(weight && { weight }), ...(file && { file }) };
}

const roleOf = (r: Pick<Rule, "spec">) => (r.spec as z.output<typeof FONT_SPEC> | null | undefined)?.role;

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

/** Default-context rules only: the page's look doesn't change as you switch context. */
export function brandTheme(rules: R[]): BrandTheme {
  const base = rules.filter((r) => r.context === null);
  const colors = base.filter((r) => r.type === "color" && isHex(r.value as string));
  // `color.primary` before `color.brand` before `color.accent`, then the first color: the order people name them.
  const named = (re: RegExp) => colors.find((r) => re.test(last(r.key)));
  const accent = named(/^primary/i) ?? named(/^brand/i) ?? named(/^accent/i) ?? colors[0];
  const hex = accent && (accent.value as string).slice(0, 7);
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

/** A font stack: the loaded file's family first, then the name as typed, then the app's own. */
export const stack = (f: ThemeFace, loaded?: string | null) =>
  [loaded, f.family].filter(Boolean).map((x) => `"${x}"`).concat("var(--font-sans)", "sans-serif").join(", ");
