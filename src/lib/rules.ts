import { z } from "zod";
import { parseTransform, serializeTransform } from "./transform.ts";

/**
 * The canon: brand rules as structured records, not documents. A rule is a
 * dotted key (`color.primary`, `logo.neverDo`), a typed value, a sentence
 * saying how to use it, and the assets it points at (the logo it governs,
 * examples). The guidelines page is rendered from these; agents
 * read them over REST and MCP.
 *
 * A rule may be scoped to one context (`dark-background`, `instagram-story`).
 * Asking for a context gets one rule per key: the context's own where it has
 * one, the default otherwise.
 *
 * Pure, like lib/fields.ts: `pnpm test` runs it under plain Node.
 */

export const RULE_TYPES = ["color", "text", "number", "list", "font"] as const;
export type RuleType = (typeof RULE_TYPES)[number];
/** A typeface: the family, and optionally the size and weight it is set at. Its files are the rule's assets. */
export type FontValue = { family: string; size?: number; weight?: number };
export type RuleValue = string | number | (string | number)[] | FontValue;

export const FONT_VALUE = z.strictObject({
  family: z.string().trim().min(1).max(120),
  size: z.number().positive().max(1000).optional().describe("Pixels"),
  weight: z.number().int().min(1).max(1000).optional().describe("400 regular, 700 bold"),
});

/** A font rule's value; one stored as a bare family name reads as that family. */
export const fontValue = (v: RuleValue): FontValue => (typeof v === "string" ? { family: v } : (v as FontValue));

/** "Inter, 32px, 700": a font value in a line. */
export const fontLabel = ({ family, size, weight }: FontValue) =>
  [family, size && `${size}px`, weight && String(weight)].filter(Boolean).join(", ");

/**
 * An asset a rule points at, as the original or at one rendition. Reads carry
 * what the asset is; writes need only `id` and `rendition`.
 */
export type RuleAsset = {
  id: string;
  rendition: string | null;
  title?: string | null;
  filename?: string;
  mime?: string;
  width?: number | null;
  height?: number | null;
  /** Has renditions (lib/preview.ts hasPreview). */
  preview?: boolean;
  /** Read from outside, a file they may see but not take (lib/rights.ts isDownloadable): no download, no link to its original. */
  kept?: true;
};

export type Rule = {
  id: string;
  /** The brand's slug. */
  brand?: string;
  key: string;
  context: string | null;
  type: RuleType;
  value: RuleValue;
  usage: string | null;
  /** In order. */
  assets: RuleAsset[];
  /** The heading readers see; `ruleName` falls back to the key in words. */
  label?: string | null;
  spec?: RuleSpec | null;
  updatedAt?: string;
};

/** `color.primary`, `type.scale`, `logo.minClearSpace`: camelCase segments, dotted. */
export const RULE_KEY = /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)*$/;
/** `dark-background`, `instagram-story`: a slug, so it sits in a URL as is. */
export const RULE_CONTEXT = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const ruleKey = z.string().max(120).regex(RULE_KEY, "Use dotted camelCase, e.g. color.primary");
export const ruleContext = z.string().max(64).regex(RULE_CONTEXT, "Use a slug, e.g. dark-background");

/** What each type's value must be. Hex colors are stored lowercase. */
export const RULE_VALUE = {
  color: z
    .string()
    .regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, "Use #rrggbb or #rrggbbaa")
    .transform((s) => s.toLowerCase()),
  /** Markdown (GFM): headings, lists, quotes, code, tables, images, dividers. */
  text: z.string().trim().min(1).max(20000).describe("Markdown (GFM)"),
  number: z.number().finite(),
  list: z.array(z.union([z.string().trim().min(1).max(500), z.number().finite()])).min(1).max(100),
  /** Its files are the rule's assets, so everyone sees the face without installing it. A bare name is `{ family }`. */
  font: z.union([z.string().trim().min(1).max(120).transform((family) => ({ family })), FONT_VALUE]),
} satisfies Record<RuleType, z.ZodType>;

export const UNITS = ["px", "pt", "mm", "cm", "in", "%", "em", "rem", "x", "ms"] as const;
const pct = z.number().min(0).max(100);
const byte = z.number().int().min(0).max(255);
const em = z.number().min(-0.2).max(1);

/**
 * What a book says about a rule beyond its value: a color's print values and
 * gradient, a number's unit, a face's role and setting. A gradient is a color
 * rule (D3): v1 readers keep its value as a usable solid.
 */
export const COLOR_SPEC = z.strictObject({
  token: z.string().trim().max(60).optional().describe("A scale name beside the brand name: Pink-500"),
  group: z.string().trim().max(60).optional().describe("Primary, Secondary, Neutrals: palettes group by it"),
  weight: pct.optional().describe("Its share of the brand's color, for the proportion bar"),
  pair: ruleKey.optional().describe("The color set on it: text on this ground, or its light partner"),
  tints: z.array(z.number().int().min(1).max(99)).max(12).optional().describe("Tint steps in percent: [80, 60, 40, 20]"),
  cmyk: z.tuple([pct, pct, pct, pct]).optional(),
  pantone: z.array(z.string().trim().min(1).max(40)).max(4).optional().describe("Free codes, coated and uncoated: 485 C, 485 U"),
  ral: z.string().trim().max(20).optional(),
  rgb: z.tuple([byte, byte, byte]).optional().describe("When the book states it rather than deriving it from the hex"),
  print: z.enum(["specified", "converted"]).optional().describe("Whether the print values were given or converted"),
  texture: z.uuid().optional().describe("An image laid over the swatch"),
  gradient: z
    .strictObject({
      kind: z.enum(["linear", "radial", "conic"]).optional(),
      angle: z.number().min(0).max(360).optional(),
      stops: z
        .array(
          z.strictObject({
            color: z.union([ruleKey, RULE_VALUE.color]).describe("A color rule's key, or a hex"),
            at: pct.optional(),
            opacity: z.number().min(0).max(1).optional(),
          }),
        )
        .min(2)
        .max(8),
    })
    .optional()
    .describe("Makes the rule a gradient; its value is the solid to use where a gradient can't go"),
});
export const NUMBER_SPEC = z.strictObject({
  unit: z.enum(UNITS).optional(),
  of: z.string().trim().max(80).optional().describe("What x or % is of: the mark's height"),
  // A value per medium is a context version of the same key (context "print").
});
export const FONT_SPEC = z.strictObject({
  role: z.enum(["display", "headline", "subhead", "body", "label", "button", "caption", "code"]).optional(),
  lineHeight: z.number().min(0.5).max(3).optional(),
  tracking: z
    .union([em, z.array(z.tuple([z.number().positive(), em])).max(12)])
    .optional()
    .describe("In em, or [size, em] pairs by size"),
  case: z.enum(["none", "upper", "lower", "title", "small-caps"]).optional(),
  script: z.string().regex(/^[A-Z][a-z]{3}$/).optional().describe("ISO 15924: Latn, Arab"),
  features: z.array(z.string().regex(/^[a-z0-9]{4}$/)).max(20).optional().describe("OpenType features on: ss01, tnum"),
  source: z.enum(["files", "google", "adobe", "system", "other"]).optional(),
  // Readers get it as a link: http(s) only, so no javascript: or data: reaches an href.
  url: z.url({ protocol: /^https?$/ }).max(500).optional().describe("Where the family comes from, or its license"),
  license: z.string().trim().max(300).optional(),
  fallback: z.string().trim().max(200).optional().describe("A CSS stack: Georgia, serif"),
  // Hides the buttons only: @font-face still serves the files, or readers would not see the face.
  download: z.boolean().optional().describe("false: readers see the face but get no files"),
});
/** Words a book gives to paste as they are: a one-liner, a boilerplate, a required credit. */
export const TEXT_SPEC = z.strictObject({
  copy: z.boolean().optional().describe("Readers paste it as it is: a copy button"),
  max: z.number().int().min(1).max(20000).optional().describe("The most characters it may take where it goes: 30 for a subtitle"),
});
export const RULE_SPEC = { color: COLOR_SPEC, number: NUMBER_SPEC, font: FONT_SPEC, text: TEXT_SPEC } as const;
export type RuleSpec = z.output<(typeof RULE_SPEC)[keyof typeof RULE_SPEC]>;

const label = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .nullable()
  .optional()
  .describe("The heading readers see; from the key when left out");
const usage = z.string().trim().max(10000).nullable().optional().describe("How and when to use it, in Markdown (GFM)");
/** A rendition spec, stored in canonical order so the same size reads the same. */
export const rendition = z
  .string()
  .max(120)
  .refine((s) => parseTransform(s) !== null && serializeTransform(parseTransform(s)!) !== "", "Not a rendition, e.g. w_512,f_png")
  .transform((s) => serializeTransform(parseTransform(s)!))
  .describe("A rendition spec, e.g. w_512,f_png; null for the original");

const ruleAsset = z
  // Not strict: a rule's assets as read can be written back as they are.
  .union([z.uuid(), z.object({ id: z.uuid(), rendition: rendition.nullable().optional() })])
  .transform((a): RuleAsset => (typeof a === "string" ? { id: a, rendition: null } : { id: a.id, rendition: a.rendition ?? null }));

const assets = z
  .array(ruleAsset)
  .max(24)
  .refine((as) => new Set(as.map((a) => a.id)).size === as.length, "Each asset once")
  .optional()
  .describe("Assets it points at, in order: an id, or { id, rendition }. Replaces the list");
const context = ruleContext.nullable().optional().describe("Only in this context; omit for the default");

const rule = <T extends RuleType>(type: T) =>
  z.strictObject({ key: ruleKey, label, context, type: z.literal(type), value: RULE_VALUE[type], usage, assets });
const spec = <S extends z.ZodType>(s: S) => s.nullable().optional().describe("Details beyond the value; null clears");
export const RuleInput = z.discriminatedUnion("type", [
  rule("color").extend({ spec: spec(RULE_SPEC.color) }),
  rule("text").extend({ spec: spec(RULE_SPEC.text) }),
  rule("number").extend({ spec: spec(RULE_SPEC.number) }),
  rule("list"),
  rule("font").extend({ spec: spec(RULE_SPEC.font) }),
]);
export type RuleInput = z.infer<typeof RuleInput>;

export const RulePatch = z.strictObject({
  key: ruleKey.optional().describe("Renames the rule and its context versions, which share a key"),
  label,
  value: z.unknown().optional().describe("Checked against the rule's type, which never changes"),
  spec: z.unknown().optional().describe("Checked against the rule's type, like value; null clears"),
  usage,
  context,
  assets,
});

export const RuleOrder = z.strictObject({
  keys: z
    .array(ruleKey)
    .min(1)
    .max(500)
    .refine((ks) => new Set(ks).size === ks.length, "Each key once")
    .describe("Keys in the order they should appear; usually one section's"),
});

/** One rule per key: the context's own where it has one, else the default. */
export function resolve<R extends Pick<Rule, "key" | "context">>(rules: R[], ctx: string): R[] {
  const out = new Map<string, R>();
  for (const r of rules) {
    if (r.context === null ? !out.has(r.key) : r.context === ctx) out.set(r.key, r);
  }
  return [...out.values()];
}

/** The page's sections: the first segment of the key. */
export const section = (key: string) => key.split(".")[0];

/** `logo.minClearSpace` reads "Min clear space": the key after its section, in words. */
export const ruleLabel = (key: string) => {
  const rest = key.split(".").slice(1).join(" ") || key;
  const words = rest.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words[0].toUpperCase() + words.slice(1);
};

/** The heading a rule reads under: its label, else its key in words. */
export const ruleName = (r: { key: string; label?: string | null }) => r.label ?? ruleLabel(r.key);

// Only a color spec names rules or assets, and no other spec shares its fields, so any spec reads as one.
const colorSpec = (spec: RuleSpec | null | undefined) => (spec ?? {}) as z.output<typeof COLOR_SPEC>;

/** The rules a spec names, its pair then its gradient stops: each must be a color rule of the brand. */
export function specKeys(spec: RuleSpec | null | undefined): string[] {
  const { pair, gradient } = colorSpec(spec);
  const stops = (gradient?.stops ?? []).map((s) => s.color).filter((c) => !c.startsWith("#"));
  return [...new Set([...(pair ? [pair] : []), ...stops])];
}

/** The assets a spec names: a color's texture. */
export function specAssets(spec: RuleSpec | null | undefined): string[] {
  const { texture } = colorSpec(spec);
  return texture ? [texture] : [];
}

/** The spec with rule `from` renamed `to`, so a rename never orphans a pair or a stop; null when it names no `from`. */
export function renameInSpec(spec: RuleSpec, from: string, to: string): RuleSpec | null {
  if (!specKeys(spec).includes(from)) return null;
  const c = colorSpec(spec);
  return {
    ...c,
    ...(c.pair === from && { pair: to }),
    ...(c.gradient && {
      gradient: { ...c.gradient, stops: c.gradient.stops.map((s) => (s.color === from ? { ...s, color: to } : s)) },
    }),
  };
}

/** `dark-background` as a person reads it: "Dark background". The slug stays in URLs and the API. */
export const contextLabel = (context: string) => {
  const words = context.replace(/-/g, " ");
  return words[0].toUpperCase() + words.slice(1);
};

export type ListStyle = "bullets" | "do" | "dont" | "scale";

/**
 * How a list reads, from its key: `logo.neverDo` and `tone.avoid` are don'ts,
 * `tone.always` a do, an all-number `type.scale` a type specimen.
 */
export function listStyle(key: string, values: (string | number)[]): ListStyle {
  const last = key.split(".").pop()!;
  const numbers = values.length > 0 && values.every((v) => typeof v === "number");
  if (numbers && (section(key) === "type" || /scale|sizes?$/i.test(last))) return "scale";
  if (/^(never|dont|donts|avoid|banned|forbidden)|Never|Avoid|Dont/.test(last)) return "dont";
  if (/^(do|dos|always|follow|prefer)([A-Z]|$)/.test(last)) return "do";
  return "bullets";
}
