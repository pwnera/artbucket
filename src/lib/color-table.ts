import { contrast, isHex } from "./color.ts";
import { resolve, type COLOR_SPEC, type Rule } from "./rules.ts";
import type { z } from "zod";

/**
 * A brand's colors as a token table, the way the Rules tab shows them: one
 * row per color, grouped as the palette groups them (spec.group), its light
 * value (the default version) beside its dark one (its version for the
 * brand's dark context, else inherited from light). Text colors (ink, muted,
 * or a color's spec.pair) carry their contrast on their ground, in each theme.
 *
 * Pure, like lib/rules.ts: `pnpm test` runs it under plain Node.
 */

type C = Pick<Rule, "key" | "type" | "value" | "context" | "spec">;
type Spec = z.output<typeof COLOR_SPEC>;

export type Cell = {
  hex: string;
  /** False: no dark version, so the light value carries over. */
  own: boolean;
  /** On the group's ground; null for the ground itself and for colors that aren't text. */
  ratio: number | null;
};
export type ColorRow = { key: string; group: string; light: Cell; dark: Cell };

/** The context a color's dark value lives in: the brand's own (`dark`, `dark-mode`), else the one agents know, dark-background. */
export const darkContext = (contexts: (string | null)[]) => contexts.find((c) => c && /(^|-)dark(-|$)/.test(c)) ?? "dark-background";

const last = (key: string) => key.split(".").pop()!;
const spec = (r: C) => (r.spec ?? {}) as Spec;
/** The names deriveTheme reads a surface or a dark ground from (brand-theme.ts). */
const GROUND = /^(background|surface|paper|ground|canvas|dark|night|navy|black)$/i;
const LIGHT_GROUND = /^(background|surface|paper|ground|canvas)$/i;
/** paper's ink, night's nightMuted: text by its name. */
const TEXT = /(ink|text|foreground|muted)$/i;

const colors = (rules: C[]) => rules.filter((r) => r.type === "color" && isHex(r.value as string));
const solid = (r: C) => (r.value as string).slice(0, 7);

/**
 * Every color with a default version, by group in the order each group first
 * appears; ungrouped colors under "". `dark` is darkContext's answer.
 */
export function colorTable(rules: C[], dark: string): { group: string; rows: ColorRow[] }[] {
  const by = new Map<string, ColorRow[]>();
  for (const r of colors(rules).filter((x) => x.context === null)) {
    const row = colorRow(rules, r.key, dark)!;
    by.set(row.group, [...(by.get(row.group) ?? []), row]);
  }
  return [...by].map(([group, rows]) => ({ group, rows }));
}

/** One color's row; null when the key has no color version. */
export function colorRow(rules: C[], key: string, dark: string): ColorRow | null {
  const all = colors(rules);
  const light = resolve(all, "");
  const night = resolve(all, dark);
  const r = light.find((x) => x.key === key) ?? all.find((x) => x.key === key);
  if (!r) return null;
  const group = spec(r).group ?? "";
  // The ground: the color that pairs with it, one named as a ground in its group, the group's first that isn't text, else the palette's light surface.
  const others = light.filter((x) => x.key !== key);
  const mine = others.filter((x) => (spec(x).group ?? "") === group);
  const paired = others.find((x) => spec(x).pair === key);
  const ground =
    paired ??
    mine.find((x) => GROUND.test(last(x.key))) ??
    (group ? mine.find((x) => !TEXT.test(last(x.key))) : undefined) ??
    others.find((x) => LIGHT_GROUND.test(last(x.key)));
  const text = !!paired || (!!ground && TEXT.test(last(key)));
  const cell = (set: C[], own: boolean): Cell => {
    const v = set.find((x) => x.key === key) ?? r;
    const g = ground && set.find((x) => x.key === ground.key);
    return { hex: solid(v), own, ratio: text && g ? contrast(solid(v), solid(g)) : null };
  };
  return {
    key,
    group,
    light: cell(light, true),
    dark: cell(night, all.some((x) => x.key === key && x.context === dark)),
  };
}
