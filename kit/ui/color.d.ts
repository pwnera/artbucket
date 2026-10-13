export type Rgb = [r: number, g: number, b: number];
export type Cmyk = [c: number, m: number, y: number, k: number];
/** "#6d4aff" or "#6d4aff80", as a color rule stores it. */
export declare const isHex: (v: string) => boolean;
/** "6D4AFF", "#abc" and "#6d4aff" are one color, saved as the last; null when it isn't a hex at all. */
export declare function hexOf(typed: string): string | null;
/** "#34a853" or "#34a853ff" (alpha ignored) to [52, 168, 83]. */
export declare function rgb(hex: string): Rgb;
export declare function hsl(rgb: Rgb): [h: number, s: number, l: number];
/** WCAG 2 relative luminance. */
export declare function luminance(rgb: Rgb): number;
/** Contrast ratio, 1 to 21. */
export declare function contrast(a: string, b: string): number;
/** What a ratio allows for text: AAA and AA at 7 and 4.5, large text only from 3. */
export declare function grade(ratio: number): "AAA" | "AA" | "AA large" | "fail";
/** Black or white, whichever reads better on this color. */
export declare const inkOn: (hex: string) => "#ffffff" | "#000000";
/** `a` moved toward `b` by `t`, 0 to 1, in sRGB. Always "#rrggbb". */
export declare function mix(a: string, b: string, t: number): string;
/** A tint at `pct` percent of the color, the rest paper white. Always "#rrggbb". */
export declare const tintOf: (color: string, pct: number) => string;
/** CMYK in whole percents, converted naively from RGB (no ICC profile). */
export declare function toCmyk(color: string): Cmyk;
