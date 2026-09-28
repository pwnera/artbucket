/**
 * Just enough color math for the guidelines page: RGB and HSL readouts, and
 * WCAG 2 contrast so a palette says where each color may carry text.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

export type Rgb = [r: number, g: number, b: number];

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

/** Black or white, whichever reads better on this color. */
export const inkOn = (hex: string) => (contrast(hex, "#ffffff") >= contrast(hex, "#000000") ? "#ffffff" : "#000000");

const hex = (c: Rgb) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/**
 * The color, moved toward white on a dark background or black on a light
 * one, just until it clears `min` against it: an org accent that vanishes in
 * one theme still draws buttons and focus rings there. Always a normalized
 * "#rrggbb", so it is safe to write into CSS.
 */
export function lift(color: string, bg: string, min = 3) {
  const c = rgb(color);
  const to = luminance(rgb(bg)) < 0.5 ? 255 : 0;
  for (let t = 0; t < 1; t += 0.05) {
    const x = hex(c.map((v) => v + (to - v) * t) as Rgb);
    if (contrast(x, bg) >= min) return x;
  }
  return hex([to, to, to]);
}
