import { lift } from "./color.ts";
import { isFont } from "./font.ts";
import { fontValue, type Rule } from "./rules.ts";

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

type R = Pick<Rule, "key" | "type" | "value" | "context" | "assets">;

const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
const last = (key: string) => key.split(".").pop()!;

/** The app's page backgrounds (globals.css), which the accent must read on. */
const LIGHT = "#ffffff";
const DARK = "#111111";

function face(r: R | undefined): ThemeFace | undefined {
  if (!r) return undefined;
  const { family, weight } = fontValue(r.value);
  const file = r.assets.find((a) => a.mime && isFont(a.mime, a.filename ?? ""))?.id;
  return { family, ...(weight && { weight }), ...(file && { file }) };
}

/** Default-context rules only: the page's look doesn't change as you switch context. */
export function brandTheme(rules: R[]): BrandTheme {
  const base = rules.filter((r) => r.context === null);
  const colors = base.filter((r) => r.type === "color" && HEX.test(r.value as string));
  const fonts = base.filter((r) => r.type === "font");
  // `color.primary` before `color.brand` before `color.accent`, then the first color: the order people name them.
  const named = (re: RegExp) => colors.find((r) => re.test(last(r.key)));
  const accent = named(/^primary/i) ?? named(/^brand/i) ?? named(/^accent/i) ?? colors[0];
  const hex = accent && (accent.value as string).slice(0, 7);
  const head = fonts.find((r) => /^(head|display|title)/i.test(last(r.key))) ?? fonts[0];
  const body = fonts.find((r) => r !== head && /^(body|text|base|primary|copy)/i.test(last(r.key))) ?? head;
  return {
    ...(hex && { accent: { light: lift(hex, LIGHT), dark: lift(hex, DARK) } }),
    ...(head && { head: face(head) }),
    ...(body && { body: face(body) }),
  };
}

/** A font stack: the loaded file's family first, then the name as typed, then the app's own. */
export const stack = (f: ThemeFace, loaded?: string | null) =>
  [loaded, f.family].filter(Boolean).map((x) => `"${x}"`).concat("var(--font-sans)", "sans-serif").join(", ");
