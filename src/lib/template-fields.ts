import { z } from "zod";
import { pageSlug, TEMPLATE_PROPS, type Template } from "./pages.ts";

/**
 * A template's props as form fields, read off TEMPLATE_PROPS, so the
 * builder's section panel has a control for every prop of every template
 * and a prop added to the schema shows up there with nothing else to write.
 * `about` is the schema's description, written for agents; the panel shows
 * it as help. Pure: `pnpm test` runs it under plain Node.
 */
export type Field = { name: string; label: string; about?: string } & (
  | { kind: "choice"; options: string[]; /** What the template draws when it is left out. */ fallback: string }
  | { kind: "switch"; /** What the template does when it is left out. */ fallback: boolean }
  | { kind: "number"; min?: number; max?: number; int: boolean }
  | { kind: "text"; max?: number; long: boolean }
  | { kind: "multi"; options: string[] }
  | { kind: "numbers" }
  | { kind: "asset" }
  | { kind: "page" }
  | { kind: "collection" | "search" }
  | { kind: "group"; fields: Field[] }
  /** Nothing to set it with here yet: an agent sets it (copy's form). */
  | { kind: "other" }
);

/** Where the template's default isn't its first option, or a boolean is on when left out. The renderers say so. */
const FALLBACK: Record<string, string | boolean> = {
  "embed.aspect": "auto",
  "request.kind": "question",
  "cover.strip": true,
  "cover.markSize": "medium",
  "cover.titleSize": "large",
  "logos.kit": true,
  "collection.downloads": true,
  "icons.downloads": true,
  "icons.sort": "name",
};

/** Names readers of the panel know them by, where the prop's own name says less. */
const LABELS: Record<string, string> = {
  show: "Values shown",
  media: "Opens on",
  matrix: "Contrast of every pair",
  ase: "Swatch download (.ase)",
  simulate: "Color blindness views",
  roles: "Table of roles",
  glyphs: "Character sets",
  embed: "Code to load the faces",
  sample: "Specimen text",
  formula: "Type scale",
  kit: "Download every mark",
  ask: "Which mark for which context",
  flip: "Picture on the other side",
  strip: "Palette as a strip",
  mark: "Logo",
  markFrame: "Logo frame",
  markSize: "Logo size",
  from: "Pages under",
  depth: "Levels",
  query: "Filters",
  downloads: "Offer downloads",
  limit: "At most",
  positions: "Where it may sit",
  partner: "Partner's name",
  scales: "Tile sizes",
  asset: "Tile",
  url: "Address",
  prompt: "What to ask for",
  template: "Text with {slots}",
  form: "Fields readers fill",
  kind: "Kind",
};

const title = (name: string) => LABELS[name] ?? name.charAt(0).toUpperCase() + name.slice(1).replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`);

function fieldOf(t: string, name: string, raw: z.ZodType): Field {
  const s = raw instanceof z.ZodOptional ? (raw.unwrap() as z.ZodType) : raw;
  const label = title(name);
  const about = raw.description ?? s.description;
  // Help that only says the name again is left out.
  const base = { name, label, about: about && about.toLowerCase() !== label.toLowerCase() ? about : undefined };
  const fallback = FALLBACK[`${t}.${name}`];
  if (s instanceof z.ZodEnum) {
    const options = s.options as string[];
    return { ...base, kind: "choice", options, fallback: typeof fallback === "string" ? fallback : options[0] };
  }
  if (s instanceof z.ZodBoolean) return { ...base, kind: "switch", fallback: fallback === true };
  if (s instanceof z.ZodNumber) return { ...base, kind: "number", min: s.minValue ?? undefined, max: s.maxValue ?? undefined, int: !!s.isInt };
  if (s instanceof z.ZodUUID) return { ...base, kind: name === "collection" || name === "search" ? name : "asset" };
  if (s === pageSlug) return { ...base, kind: "page" };
  if (s instanceof z.ZodString) return { ...base, kind: "text", max: s.maxLength ?? undefined, long: (s.maxLength ?? 0) > 300 };
  // An https address is a string format of its own.
  if ((s as { format?: string }).format === "url") return { ...base, kind: "text", long: false };
  if (s instanceof z.ZodArray) {
    const el = s.element as z.ZodType;
    if (el instanceof z.ZodEnum) return { ...base, kind: "multi", options: el.options as string[] };
    if (el instanceof z.ZodNumber) return { ...base, kind: "numbers" };
  }
  if (s instanceof z.ZodObject) {
    return { ...base, kind: "group", fields: Object.entries(s.shape as Record<string, z.ZodType>).map(([n, x]) => fieldOf(t, n, x)) };
  }
  return { ...base, kind: "other" };
}

/** The fields of a template's props, in the schema's order. */
export function fieldsOf(t: Template): Field[] {
  const shape = (TEMPLATE_PROPS[t] as z.ZodObject).shape as Record<string, z.ZodType>;
  return Object.entries(shape).map(([name, raw]) => fieldOf(t, name, raw));
}

/**
 * The props with `name` set to `value`: a value equal to what the template
 * draws when it is left out, or an empty one, leaves it out, so the stored
 * section stays as small as an agent would write it.
 */
export function withProp(props: Record<string, unknown>, f: Field, value: unknown): Record<string, unknown> {
  const next = { ...props };
  const empty = value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length);
  if (empty || ((f.kind === "choice" || f.kind === "switch") && value === f.fallback)) delete next[f.name];
  else next[f.name] = value;
  return next;
}
