import { createHash } from "node:crypto";
import { z } from "zod";
import { rgb } from "./color.ts";
import { fontStyle } from "./font.ts";

/**
 * Cards: a brand's pictures made from a URL, in its latest release's colors,
 * faces and logo, so a site's share image follows the brand without a
 * rebuild (lib/core/cards.ts draws them). A template is a size here and a
 * layout there; `og` is the Open Graph card every link preview shows.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

export const CARD_TEMPLATES = {
  og: { width: 1200, height: 630 },
} as const;
export type CardTemplate = keyof typeof CARD_TEMPLATES;
export const isCardTemplate = (t: string): t is CardTemplate => Object.hasOwn(CARD_TEMPLATES, t);

/** What a card says, from its URL's query. Short on purpose: a card is read in a glance, and drawn per URL. */
export const CardQuery = z.object({
  title: z.string({ error: "required" }).trim().min(1, "required").max(140),
  eyebrow: z.string().trim().max(60).optional(),
  subtitle: z.string().trim().max(200).optional(),
  image: z.uuid().optional().describe("An asset's id: its picture beside the text"),
  theme: z.enum(["light", "dark"]).default("light"),
});
export type CardQuery = z.output<typeof CardQuery>;

/** The query's errors in one line, as the hub's files answer them. */
export const queryIssues = (e: z.ZodError) => e.issues.map((i) => `${i.path.join(".") || "query"}: ${i.message}`).join("; ");

/**
 * The card's ETag: a hash of everything it is drawn from (the release, the
 * query, the colors, the files by id), so the same inputs answer 304 without
 * drawing, and a release that changes any of them changes it.
 */
export const cardEtag = (drawn: unknown) => `"card-${createHash("sha256").update(JSON.stringify(drawn)).digest("base64url").slice(0, 27)}"`;

/** The title's size, by its length: a short one fills the card, a long one still fits three lines. */
export function titleSize(title: string) {
  const n = [...title].length;
  return n <= 22 ? 92 : n <= 44 ? 76 : n <= 72 ? 62 : 52;
}

/** A font file the card's renderer reads: TrueType, OpenType or WOFF. Not WOFF2, which it can't. */
export const drawable = (f: { mime?: string | null; filename?: string | null }) =>
  !/woff2/.test(f.mime ?? "") && !/\.woff2$/i.test(f.filename ?? "") && (/^font\/(ttf|otf|sfnt|woff)$/.test(f.mime ?? "") || /\.(ttf|otf|woff)$/i.test(f.filename ?? ""));

/** The upright file nearest `weight` among those the renderer reads. */
export function cardFace<F extends { mime?: string | null; filename?: string | null }>(files: F[], weight = 400): F | undefined {
  const upright = files.filter((f) => drawable(f) && !fontStyle(f.filename ?? "").italic);
  return upright.sort((a, b) => Math.abs(fontStyle(a.filename ?? "").weight - weight) - Math.abs(fontStyle(b.filename ?? "").weight - weight))[0];
}

const REVERSED = /revers|invers|negative|knock|white|on-?dark|dark-?(bg|background|ground)/i;

/**
 * The logo rules a card may show, best first (the first whose picture may be
 * used wins): on a dark card, a variant made for dark grounds when the brand
 * has one (keyed reversed, white, negative..., or the theme's logo in a dark
 * context); then the theme's logo (`key`); then any other logo.
 */
export function cardLogos<R extends { key: string; context: string | null }>(rules: R[], key: string | null, dark: boolean): R[] {
  const logos = rules.filter((r) => r.key.startsWith("logo."));
  const own = logos.filter((r) => !r.context);
  const first = [
    ...(dark ? [...own.filter((r) => REVERSED.test(r.key)), ...logos.filter((r) => r.key === key && r.context && /dark|revers|invers/i.test(r.context))] : []),
    ...own.filter((r) => r.key === key),
  ];
  return [...new Set([...first, ...own.filter((r) => dark || !REVERSED.test(r.key)), ...own])];
}

/**
 * The card's color field: the accent, at full strength, unless the paper swallows it (a white or near-white accent on
 * a white card), then `fallback`. The accent is a fill here, never text, so a light one like a lime on white still
 * stands as a field: only a color within a few steps of the paper on every channel does not.
 */
export function cardField(accent: string, paper: string, fallback: string) {
  const [a, p] = [rgb(accent), rgb(paper)];
  return Math.max(...a.map((c, i) => Math.abs(c - p[i]))) > 24 ? accent : fallback;
}
