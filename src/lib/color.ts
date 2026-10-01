/**
 * Just enough color math for the guidelines page: RGB, HSL and CMYK readouts,
 * tints, and WCAG 2 contrast so a palette says where each color may carry text.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

export type Rgb = [r: number, g: number, b: number];

const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
/** "#6d4aff" or "#6d4aff80", as a color rule stores it. */
export const isHex = (v: string) => HEX.test(v);

/** "6D4AFF", "#abc" and "#6d4aff" are one color, saved as the last; null when it isn't a hex at all. */
export function hexOf(typed: string) {
  let v = typed.trim().toLowerCase();
  if (!v.startsWith("#")) v = `#${v}`;
  if (/^#[0-9a-f]{3,4}$/.test(v)) v = `#${[...v.slice(1)].map((c) => c + c).join("")}`;
  return isHex(v) ? v : null;
}

/** "#34a853" or "#34a853ff" (alpha ignored) to [52, 168, 83]. */
export function rgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function hsl([r, g, b]: Rgb): [h: number, s: number, l: number] {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return [0, 0, Math.round(l * 100)];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [Math.round((h * 60 + 360) % 360), Math.round(s * 100), Math.round(l * 100)];
}

/** WCAG 2 relative luminance. */
export function luminance([r, g, b]: Rgb) {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Contrast ratio, 1 to 21. */
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(rgb(a)), luminance(rgb(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** What a ratio allows for text: AAA and AA at 7 and 4.5, large text only from 3. */
export function grade(ratio: number): "AAA" | "AA" | "AA large" | "fail" {
  return ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA large" : "fail";
}

/** The app's page backgrounds, as --background in globals.css: what its accent and its text must read on. */
export const APP_BG = { light: "#ffffff", dark: "#141414" } as const;

/** Black or white, whichever reads better on this color. */
export const inkOn = (hex: string) => (contrast(hex, "#ffffff") >= contrast(hex, "#000000") ? "#ffffff" : "#000000");

const hex = (c: Rgb) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/** `a` moved toward `b` by `t`, 0 to 1, in sRGB: mix(surface, ink, 0.04) is a step off the surface. Always "#rrggbb". */
export function mix(a: string, b: string, t: number) {
  const y = rgb(b);
  return hex(rgb(a).map((v, i) => v + (y[i] - v) * t) as Rgb);
}

/**
 * A tint at `pct` percent of the color, the rest paper white, as print tint
 * steps are named: tintOf(c, 80) is 80% ink. Always "#rrggbb".
 */
export const tintOf = (color: string, pct: number) => mix(color, "#ffffff", 1 - pct / 100);

export type Cmyk = [c: number, m: number, y: number, k: number];

/**
 * CMYK in whole percents, converted naively from RGB (no ICC profile), for a
 * color whose book gives none. Palettes mark it converted: a printer should
 * get the book's own values, or a proof.
 */
export function toCmyk(color: string): Cmyk {
  const c = rgb(color);
  const max = Math.max(...c);
  if (!max) return [0, 0, 0, 100];
  return [...c.map((v) => Math.round(((max - v) / max) * 100)), Math.round((1 - max / 255) * 100)] as Cmyk;
}

/**
 * The color, moved toward white on a dark background or black on a light
 * one, just until it clears `min` against it: an org accent that vanishes in
 * one theme still draws buttons and focus rings there. Always a normalized
 * "#rrggbb", so it is safe to write into CSS.
 */
export function lift(color: string, bg: string, min = 3) {
  const c = rgb(color);
  // Toward whichever of black and white reads on it: on a mid ground (an orange band) white never clears 4.5.
  const to = inkOn(bg) === "#ffffff" ? 255 : 0;
  for (let t = 0; t < 1; t += 0.05) {
    const x = hex(c.map((v) => v + (to - v) * t) as Rgb);
    if (contrast(x, bg) >= min) return x;
  }
  return hex([to, to, to]);
}

/**
 * A card's ground for its mark: `fallback` while the mark's pixels read on
 * it (a mean contrast of 3), else the first palette color they read on, in
 * the brand's order, else whichever of ink and paper reads best. A white
 * mark on a pale wash gets the brand's own blue, not a guess.
 */
export function groundFor(pixels: Rgb[], fallback: string, palette: string[], min = 3) {
  if (!pixels.length) return fallback;
  const ls = pixels.map(luminance);
  const score = (g: string) => {
    const L = luminance(rgb(g));
    return ls.reduce((s, l) => s + (Math.max(l, L) + 0.05) / (Math.min(l, L) + 0.05), 0) / ls.length;
  };
  if (score(fallback) >= min) return fallback;
  return palette.find((g) => score(g) >= min) ?? ["#111111", "#fafaf7"].sort((a, b) => score(b) - score(a))[0];
}
