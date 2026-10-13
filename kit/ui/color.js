// @artbucket/ui: the color math a palette needs, the same the Artbucket app draws its palettes with.
// MIT License, see LICENSE.

const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
/** "#6d4aff" or "#6d4aff80", as a color rule stores it. */
export const isHex = (v) => HEX.test(v);

/** "6D4AFF", "#abc" and "#6d4aff" are one color, saved as the last; null when it isn't a hex at all. */
export function hexOf(typed) {
  let v = typed.trim().toLowerCase();
  if (!v.startsWith("#")) v = `#${v}`;
  if (/^#[0-9a-f]{3,4}$/.test(v)) v = `#${[...v.slice(1)].map((c) => c + c).join("")}`;
  return isHex(v) ? v : null;
}

/** "#34a853" or "#34a853ff" (alpha ignored) to [52, 168, 83]. */
export function rgb(hex) {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function hsl([r, g, b]) {
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
export function luminance([r, g, b]) {
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Contrast ratio, 1 to 21. */
export function contrast(a, b) {
  const [x, y] = [luminance(rgb(a)), luminance(rgb(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** What a ratio allows for text: AAA and AA at 7 and 4.5, large text only from 3. */
export function grade(ratio) {
  return ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA large" : "fail";
}

/** Black or white, whichever reads better on this color. */
export const inkOn = (hex) => (contrast(hex, "#ffffff") >= contrast(hex, "#000000") ? "#ffffff" : "#000000");

const toHex = (c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/** `a` moved toward `b` by `t`, 0 to 1, in sRGB: mix(surface, ink, 0.04) is a step off the surface. Always "#rrggbb". */
export function mix(a, b, t) {
  const y = rgb(b);
  return toHex(rgb(a).map((v, i) => v + (y[i] - v) * t));
}

/** A tint at `pct` percent of the color, the rest paper white, as print tint steps are named: tintOf(c, 80) is 80% ink. */
export const tintOf = (color, pct) => mix(color, "#ffffff", 1 - pct / 100);

/**
 * CMYK in whole percents, converted naively from RGB (no ICC profile), for a
 * color whose book gives none: a printer should get the book's own values, or a proof.
 */
export function toCmyk(color) {
  const c = rgb(color);
  const max = Math.max(...c);
  if (!max) return [0, 0, 0, 100];
  return [...c.map((v) => Math.round(((max - v) / max) * 100)), Math.round((1 - max / 255) * 100)];
}
