/**
 * The geometry of a diagram section (build spec D23): clear space around a
 * mark, a minimum size in physical units, a mark placed on a page, and a
 * mark beside a partner's. Boxes are in the diagram's own units, the mark's
 * height being MARK of them, so the renderer draws them into an SVG viewBox
 * and labels stay one size whatever the picture's pixels.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

export type Size = { width: number; height: number };
export type Box = Size & { x: number; y: number };

/** The mark's height in diagram units. */
export const MARK = 100;

/** The mark at MARK high, as wide as its picture says; square when it says nothing. */
export const markSize = (width?: number | null, height?: number | null): Size => ({
  width: width && height ? (MARK * width) / height : MARK,
  height: MARK,
});

// ---- units --------------------------------------------------------------------

/** CSS px per unit: CSS fixes 96px to the inch, so a true size is a CSS length at 100% zoom. */
const PX: Record<string, number> = { px: 1, pt: 96 / 72, mm: 96 / 25.4, cm: 96 / 2.54, in: 96 };

/** A length in CSS px; null for a unit of something else (x, %, em) or none. */
export const toPx = (value: number, unit: string | undefined): number | null => (unit && PX[unit] ? value * PX[unit] : null);

/** A length in px, mm and pt, for the text beside a true size. */
export function lengths(value: number, unit: string | undefined): { px: number; mm: number; pt: number } | null {
  const px = toPx(value, unit);
  return px === null ? null : { px, mm: px / PX.mm, pt: px / PX.pt };
}

/** What a rule's `of` measures: a width, a height, or a side; `fallback` when it names none. */
export function sideOf(of: string | undefined, size: Size, fallback: "height" | "shorter"): number {
  const o = of?.toLowerCase() ?? "";
  if (/width|wide/.test(o)) return size.width;
  if (/height|tall/.test(o)) return size.height;
  if (/long/.test(o)) return Math.max(size.width, size.height);
  if (/short/.test(o)) return Math.min(size.width, size.height);
  return fallback === "height" ? size.height : Math.min(size.width, size.height);
}

/** A number rule as the diagrams read it. */
export type Spacing = { value: number; unit?: string; of?: string };

/**
 * A spacing rule in the diagram's units. x is times the mark (its height,
 * unless `of` says its width). % is of the page when there is one and `of`
 * doesn't name the mark (its shorter side unless `of` says), else of the
 * mark. A length lands only on a page, whose units are mm. Null when it
 * can't be drawn.
 */
export function spacing(rule: Spacing, mark: Size, page?: Size): number | null {
  if (rule.unit === "x") return rule.value * sideOf(rule.of, mark, "height");
  if (rule.unit === "%")
    return page && !/mark|logo/i.test(rule.of ?? "") ? (rule.value / 100) * sideOf(rule.of, page, "shorter") : (rule.value / 100) * sideOf(rule.of, mark, "height");
  const px = toPx(rule.value, rule.unit);
  return px !== null && page ? px / PX.mm : null;
}

/** A size against the minimum, compared in px; null when either is not a length. */
export function meetsMin(size: { value: number; unit?: string }, min: { value: number; unit?: string }): boolean | null {
  const a = toPx(size.value, size.unit);
  const b = toPx(min.value, min.unit);
  // A hair under, from converting mm to pt and back, still passes.
  return a === null || b === null ? null : a >= b - 1e-9;
}

// ---- clear space --------------------------------------------------------------

/** The mark, and the zone `pad` wide around it that nothing else enters. */
export function clearSpace(mark: Size, pad: number): { zone: Box; mark: Box } {
  return {
    zone: { x: 0, y: 0, width: mark.width + 2 * pad, height: mark.height + 2 * pad },
    mark: { x: pad, y: pad, ...mark },
  };
}

// ---- placement ----------------------------------------------------------------

export const POSITIONS = ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"] as const;
export type Position = (typeof POSITIONS)[number];

/** An A4 page, portrait, in mm: a margin in mm lands on it as it would on paper. */
export const PAGE: Size = { width: 210, height: 297 };

/**
 * The mark as the page diagram shows it: a quarter of the page wide, no
 * taller than a twelfth of it. An illustration: the rules give no size on a page.
 */
export function onPage(mark: Size, page: Size = PAGE): Size {
  const height = Math.min(page.height / 12, ((page.width / 4) * mark.height) / mark.width);
  return { width: (height * mark.width) / mark.height, height };
}

const ROW = { t: 0, m: 0.5, b: 1 } as const;
const COL = { l: 0, c: 0.5, r: 1 } as const;

/** Where the mark sits at `pos`, `margin` in from the page's edges it is against. */
export function place(page: Size, mark: Size, pos: Position, margin: number): Box {
  const [r, c] = [ROW[pos[0] as keyof typeof ROW], COL[pos[1] as keyof typeof COL]];
  const at = (share: number, room: number, own: number) => margin + share * (room - own - 2 * margin);
  return { x: at(c, page.width, mark.width), y: at(r, page.height, mark.height), ...mark };
}

/** A position in words, for the text beside the page and a screen reader. */
export function positionName(pos: Position): string {
  const row = { t: "top", m: "middle", b: "bottom" }[pos[0] as "t" | "m" | "b"];
  const col = { l: "left", c: "center", r: "right" }[pos[1] as "l" | "c" | "r"];
  return pos === "mc" ? "center" : `${row} ${col}`;
}

// ---- co-brand -----------------------------------------------------------------

export type Separator = "line" | "x" | "none";

/**
 * The mark, then the partner's, at the same height and centered on one line,
 * `gap` apart; with a separator, `gap` on each side of it. The x is a third of
 * the mark's height across.
 */
export function cobrand(
  mark: Size,
  partner: Size,
  gap: number,
  separator: Separator,
): { size: Size; mark: Box; partner: Box; separator: Box | null } {
  const h = mark.height;
  const theirs = { width: (partner.width * h) / partner.height, height: h };
  const sep = separator === "x" ? h / 3 : 0;
  const sepAt = mark.width + gap;
  const partnerAt = separator === "none" ? mark.width + gap : sepAt + sep + gap;
  return {
    size: { width: partnerAt + theirs.width, height: h },
    mark: { x: 0, y: 0, ...mark },
    partner: { x: partnerAt, y: 0, ...theirs },
    separator: separator === "none" ? null : { x: sepAt, y: separator === "x" ? (h - sep) / 2 : 0, width: sep, height: separator === "x" ? sep : h },
  };
}

// ---- words --------------------------------------------------------------------

/** A number as a reader reads it: at most two decimals, none trailing. */
export const num = (n: number) => String(Math.round(n * 100) / 100);

/** A value and its unit: 0.5x, 5%, 24 px. */
export function measure(value: number, unit: string | undefined): string {
  if (!unit) return num(value);
  return unit === "x" || unit === "%" ? `${num(value)}${unit}` : `${num(value)} ${unit}`;
}
