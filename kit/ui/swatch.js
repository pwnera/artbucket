// @artbucket/ui: what a palette says about a color, the same in a portal Artbucket draws and a site built with the
// kit: its values for screen and print, and the text set on it with how well that reads (WCAG 2).
// Pure, no DOM. MIT License, see LICENSE.
import { contrast, grade, hsl, inkOn, rgb, toCmyk } from "./color.js";

/** The values a palette shows for screen, and for print, in their order. */
export const SCREEN = ["hex", "rgb", "hsl", "token", "css"];
export const PRINT = ["cmyk", "pantone", "ral"];

/** A rule's key as a CSS custom property's name: color.primaryDark is color-primary-dark. */
export const kebab = (key) => key.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/\./g, "-").toLowerCase();

/**
 * The values `show` asks for (SCREEN and PRINT's names) that the color has, in that order, each
 * `{ label, text, converted? }`. The rule's spec gives what the book states (rgb, cmyk, pantone, ral, token);
 * CMYK it doesn't give is converted from the hex, and says so.
 */
export function colorValues(rule, show = [...SCREEN, ...PRINT]) {
  const hex = String(rule.value);
  const s = rule.spec ?? {};
  const [R, G, B] = s.rgb ?? rgb(hex);
  // #rrggbbaa: the RGB says how see-through.
  const alpha = hex.length === 9 ? Math.round((parseInt(hex.slice(7), 16) / 255) * 100) : 100;
  return show.flatMap((v) => {
    switch (v) {
      case "hex":
        return [{ label: "HEX", text: hex }];
      case "rgb":
        return [{ label: "RGB", text: alpha < 100 ? `rgb(${R} ${G} ${B} / ${alpha}%)` : `rgb(${R} ${G} ${B})` }];
      case "hsl": {
        const [h, sat, l] = hsl([R, G, B]);
        return [{ label: "HSL", text: `hsl(${h} ${sat}% ${l}%)` }];
      }
      case "token":
        return s.token ? [{ label: "Token", text: s.token }] : [];
      case "css":
        return [{ label: "CSS", text: `var(--${kebab(rule.key)})` }];
      case "cmyk": {
        const [c, m, y, k] = s.cmyk ?? toCmyk(hex);
        return [{ label: "CMYK", text: `C${c} M${m} Y${y} K${k}`, converted: s.print === "converted" || !s.cmyk }];
      }
      case "pantone":
        return (s.pantone ?? []).map((p) => ({ label: "Pantone", text: p }));
      case "ral":
        return s.ral ? [{ label: "RAL", text: `RAL ${s.ral}` }] : [];
      default:
        return [];
    }
  });
}

/**
 * The text set on a color: the color its spec pairs with it (`pair`, a key among `rules`), else whichever of
 * black and white reads; with the contrast ratio and its grade (AAA, AA, AA large, fail).
 */
export function swatchInk(rule, rules = []) {
  const hex = String(rule.value).slice(0, 7);
  const key = rule.spec?.pair;
  const partner = key ? rules.find((x) => x.key === key && x.type === "color") : undefined;
  const ink = partner ? String(partner.value).slice(0, 7) : inkOn(hex);
  const ratio = contrast(ink, hex);
  return { ink, partner: partner ?? null, ratio, grade: grade(ratio) };
}
