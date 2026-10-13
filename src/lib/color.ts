/**
 * Just enough color math for the guidelines page: RGB, HSL and CMYK readouts,
 * tints, and WCAG 2 contrast so a palette says where each color may carry text.
 * The math a palette shows is the kit's (kit/ui/color.js, @artbucket/ui), so a
 * managed site and a site built with the kit give the same values.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */
import { contrast, inkOn, luminance, rgb, type Rgb } from "../../kit/ui/color.js";

export { contrast, grade, hexOf, hsl, inkOn, isHex, luminance, mix, rgb, tintOf, toCmyk, type Cmyk, type Rgb } from "../../kit/ui/color.js";

/** The app's page backgrounds, as --background in globals.css: what its accent and its text must read on. */
export const APP_BG = { light: "#ffffff", dark: "#141414" } as const;

const hex = (c: Rgb) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

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
 * mark on a pale wash gets the brand's own blue, not a guess. A palette
 * color that part of the mark is drawn in (5% of its pixels or more, under a
 * contrast of 1.5) is passed over: Databricks' white wordmark reads on its
 * red, its red mark doesn't.
 */
export function groundFor(pixels: Rgb[], fallback: string, palette: string[], min = 3) {
  if (!pixels.length) return fallback;
  const ls = pixels.map(luminance);
  const ratios = (g: string) => {
    const L = luminance(rgb(g));
    return ls.map((l) => (Math.max(l, L) + 0.05) / (Math.min(l, L) + 0.05));
  };
  const score = (g: string) => ratios(g).reduce((s, r) => s + r, 0) / ls.length;
  const whole = (g: string) => ratios(g).filter((r) => r < 1.5).length < 0.05 * ls.length;
  if (score(fallback) >= min) return fallback;
  return palette.find((g) => score(g) >= min && whole(g)) ?? ["#111111", "#fafaf7"].sort((a, b) => score(b) - score(a))[0];
}
