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
  text: z.string().trim().min(1).max(2000),
  number: z.number().finite(),
  list: z.array(z.union([z.string().trim().min(1).max(500), z.number().finite()])).min(1).max(100),
  /** Its files are the rule's assets, so everyone sees the face without installing it. A bare name is `{ family }`. */
  font: z.union([z.string().trim().min(1).max(120).transform((family) => ({ family })), FONT_VALUE]),
} satisfies Record<RuleType, z.ZodType>;

const usage = z.string().trim().max(2000).nullable().optional().describe("How and when to use it, in a sentence");
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
  z.strictObject({ key: ruleKey, context, type: z.literal(type), value: RULE_VALUE[type], usage, assets });
export const RuleInput = z.discriminatedUnion("type", [
  rule("color"),
  rule("text"),
  rule("number"),
  rule("list"),
  rule("font"),
]);
export type RuleInput = z.infer<typeof RuleInput>;

export const RulePatch = z.strictObject({
  key: ruleKey.optional().describe("Renames the rule and its context versions, which share a key"),
  value: z.unknown().optional().describe("Checked against the rule's type, which never changes"),
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
