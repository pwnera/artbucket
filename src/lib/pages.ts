import { z } from "zod";
import { fontValue, listStyle, ruleKey, ruleLabel, section, type Rule, type RuleType } from "./rules.ts";

/**
 * Brand pages: how guidelines are laid out for people, over the rules agents
 * read. A page is an ordered list of sections; a section is a template (a
 * palette, a type specimen, a do/don't grid, a collection of assets...) with
 * the rules it shows bound by key, and a little layout. Rules stay the source
 * of truth: a section never holds a rule's value, so a rule changed anywhere
 * changes on every page that shows it.
 *
 * Pages are stored whole (brand_pages.sections), written whole by agents
 * (save_page) or an operation at a time (edit_page), and kept in the brand's
 * history beside its rules.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

export const TEMPLATES = ["cover", "text", "split", "palette", "type", "logos", "dodont", "gallery", "collection"] as const;
export type Template = (typeof TEMPLATES)[number];

export const WIDTHS = ["text", "wide", "full"] as const;
export const TONES = ["plain", "tint", "brand"] as const;

type Bindable = Pick<Rule, "key" | "type" | "value" | "assets">;
const scale = (r: Bindable) => r.type === "list" && listStyle(r.key, r.value as (string | number)[]) === "scale";
const hasAssets = (r: Bindable) => r.assets.length > 0;

/** What each template is for, what it binds, and how it sits by default. `list_templates` serves this. */
export const TEMPLATE_INFO: Record<
  Template,
  {
    name: string;
    use: string;
    /** What its keys may name, in words, and as a check. Null: it binds no rules. */
    binds: string | null;
    accepts: ((r: Bindable) => boolean) | null;
    width: (typeof WIDTHS)[number];
    columns: number;
    tone: (typeof TONES)[number];
  }
> = {
  cover: {
    name: "Cover",
    use: "The opening: the brand's name big on its color, a line under it, the palette as a strip. First on a first page.",
    binds: null,
    accepts: null,
    width: "full",
    columns: 1,
    tone: "brand",
  },
  text: {
    name: "Text",
    use: "Prose in Markdown, and rules read as statements: a voice, a minimum size, a list of habits.",
    binds: "text, number and list rules",
    accepts: (r) => r.type === "text" || r.type === "number" || r.type === "list",
    width: "text",
    columns: 1,
    tone: "plain",
  },
  split: {
    name: "Split",
    use: "Words beside an image: a rule's picture, or props.image.",
    binds: "rules with assets",
    accepts: hasAssets,
    width: "wide",
    columns: 1,
    tone: "plain",
  },
  palette: {
    name: "Color palette",
    use: "Swatches with their values and contrast.",
    binds: "color rules",
    accepts: (r) => r.type === "color",
    width: "wide",
    columns: 3,
    tone: "plain",
  },
  type: {
    name: "Type specimen",
    use: "Faces set in themselves, and the type scale; readers can type their own text.",
    binds: "font rules and a type scale (a list of numbers)",
    accepts: (r) => r.type === "font" || scale(r),
    width: "wide",
    columns: 1,
    tone: "plain",
  },
  logos: {
    name: "Logo showcase",
    use: "Marks on light and dark, ready to download.",
    binds: "rules with assets (the logo files)",
    accepts: hasAssets,
    width: "wide",
    columns: 2,
    tone: "plain",
  },
  dodont: {
    name: "Do / Don't",
    use: "Side by side, green and red. A list named like always, do or prefer is a do; never, avoid or dont a don't.",
    binds: "list rules",
    accepts: (r) => r.type === "list" && !scale(r),
    width: "wide",
    columns: 2,
    tone: "plain",
  },
  gallery: {
    name: "Gallery",
    use: "In-use examples: the pictures of the rules it binds.",
    binds: "rules with assets",
    accepts: hasAssets,
    width: "full",
    columns: 3,
    tone: "plain",
  },
  collection: {
    name: "Collection",
    use: "Live assets from the library: a collection, a saved search, or a query. Only approved, current, unexpired assets show; new ones appear as they are approved.",
    binds: null,
    accepts: null,
    width: "full",
    columns: 4,
    tone: "plain",
  },
};

// ---- schemas ----------------------------------------------------------------

export const pageSlug = z.string().max(60).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use a slug, e.g. logo or voice-and-tone");
export const sectionId = z.string().regex(/^[a-z0-9_-]{1,40}$/i, "Letters, digits, - and _");

const image = z.uuid().optional().describe("An asset id, from search_assets");

/** Each template's own settings. Strict: a misspelled one is an error, not ignored. */
export const TEMPLATE_PROPS = {
  cover: z.strictObject({ image: image.describe("A background image instead of the brand color") }),
  text: z.strictObject({}),
  split: z.strictObject({ image: image.describe("Shown beside the words; else the first bound rule's picture"), flip: z.boolean().optional().describe("Image on the left") }),
  palette: z.strictObject({}),
  type: z.strictObject({ sample: z.string().max(200).optional().describe("The specimen's starting text") }),
  logos: z.strictObject({}),
  dodont: z.strictObject({}),
  gallery: z.strictObject({}),
  collection: z
    .strictObject({
      collection: z.uuid().optional().describe("A collection's id"),
      search: z.uuid().optional().describe("A saved search's id"),
      query: z
        .string()
        .max(2000)
        .optional()
        .describe("Filters, as the library's query string: q=poster&type=image&tag=campaign&f.channel=web. Narrows the collection or saved search"),
      sort: z.enum(["newest", "oldest", "name"]).optional(),
      limit: z.number().int().min(1).max(200).optional().describe("At most this many; 24 when left out"),
      layout: z.enum(["grid", "masonry", "list"]).optional(),
      downloads: z.boolean().optional().describe("Offer downloads; true when left out"),
    })
    .refine((p) => !(p.collection && p.search), "A collection or a saved search, not both"),
} satisfies Record<Template, z.ZodType>;

const base = {
  id: sectionId.optional().describe("Kept across edits; made up when left out"),
  title: z.string().trim().max(300).optional(),
  body: z.string().trim().max(20000).optional().describe("Markdown (GFM), shown under the title"),
  width: z.enum(WIDTHS).optional().describe("text (a reading column), wide, or full bleed; the template's default when left out"),
  columns: z.number().int().min(1).max(4).optional(),
  tone: z.enum(TONES).optional().describe("Background: plain, tint (a wash of the brand color) or brand (the brand color)"),
  hidden: z.boolean().optional().describe("Kept, but not shown to readers"),
  keys: z
    .array(ruleKey)
    .max(100)
    .refine((ks) => new Set(ks).size === ks.length, "Each key once")
    .optional()
    .describe("The rules it shows, by key, in order"),
};

const variant = <T extends Template>(t: T) => z.strictObject({ ...base, template: z.literal(t), props: TEMPLATE_PROPS[t].optional() });

export const SectionInput = z.discriminatedUnion("template", [
  variant("cover"),
  variant("text"),
  variant("split"),
  variant("palette"),
  variant("type"),
  variant("logos"),
  variant("dodont"),
  variant("gallery"),
  variant("collection"),
]);
export type SectionInput = z.input<typeof SectionInput>;

/** A section as stored: every setting filled in. */
export type Section = {
  id: string;
  template: Template;
  title: string;
  body: string;
  width: (typeof WIDTHS)[number];
  columns: number;
  tone: (typeof TONES)[number];
  hidden: boolean;
  keys: string[];
  props: Record<string, unknown>;
};

export const PageInput = z.strictObject({
  title: z.string().trim().min(1).max(120),
  hidden: z.boolean().optional().describe("Kept, but not published"),
  position: z.number().int().min(0).optional().describe("Where among the brand's pages, from 0; the end for a new page"),
  sections: z.array(SectionInput).max(60).describe("The whole page, top to bottom"),
});

/** One change to a page's sections, for edit_page: applied in order, checked together. */
export const PageOp = z.discriminatedUnion("op", [
  z.strictObject({
    op: z.literal("add"),
    section: SectionInput,
    after: sectionId.nullable().optional().describe("Add it after this section; null for the top; the end when left out"),
  }),
  z.strictObject({
    op: z.literal("update"),
    id: sectionId,
    set: z
      .record(z.string(), z.unknown())
      .describe("What changes, e.g. { title, keys, width, props }. props replaces the section's props whole; template can change too"),
  }),
  z.strictObject({ op: z.literal("move"), id: sectionId, after: sectionId.nullable().describe("After this section; null for the top") }),
  z.strictObject({ op: z.literal("remove"), id: sectionId }),
]);
export type PageOp = z.output<typeof PageOp>;

/** A page as history and publishing keep it. */
export type SnapPage = { slug: string; title: string; position: number; hidden: boolean; sections: Section[] };

const newId = () => `s${Math.random().toString(36).slice(2, 10)}`;

/** A parsed section with its template's defaults filled in, and an id. */
export function normalize(s: z.output<typeof SectionInput>, taken: Set<string>): Section {
  const info = TEMPLATE_INFO[s.template];
  let id = s.id ?? newId();
  while (!s.id && taken.has(id)) id = newId();
  taken.add(id);
  return {
    id,
    template: s.template,
    title: s.title ?? "",
    body: s.body ?? "",
    width: s.width ?? info.width,
    columns: s.columns ?? info.columns,
    tone: s.tone ?? info.tone,
    hidden: s.hidden ?? false,
    keys: s.keys ?? [],
    props: (s.props ?? {}) as Record<string, unknown>,
  };
}

/** A zod error as the lines an agent can act on: `sections[2].props.limit: Too big`. */
export function issues(err: z.ZodError, prefix = ""): string[] {
  return err.issues.map((i) => {
    const path = i.path.reduce<string>((p, k) => (typeof k === "number" ? `${p}[${k}]` : p ? `${p}.${String(k)}` : String(k)), prefix);
    return `${path || "input"}: ${i.message}`;
  });
}

/**
 * Parse a page's sections: defaults filled in, ids kept or made, and every
 * problem listed at once with its path. Ids must be unique on the page.
 */
export function parseSections(raw: unknown[], prefix = "sections"): { sections: Section[]; errors: string[] } {
  const errors: string[] = [];
  const taken = new Set<string>();
  const ids = raw.flatMap((s) => (s && typeof s === "object" && "id" in s && typeof s.id === "string" ? [s.id] : []));
  for (const dup of new Set(ids.filter((x, i) => ids.indexOf(x) !== i))) errors.push(`${prefix}: section id "${dup}" is used twice`);
  ids.forEach((x) => taken.add(x));
  const sections: Section[] = [];
  raw.forEach((s, i) => {
    const got = SectionInput.safeParse(s);
    if (!got.success) errors.push(...issues(got.error, `${prefix}[${i}]`));
    else sections.push(normalize(got.data, taken));
  });
  return { sections, errors };
}

const TYPE_WORD: Record<RuleType, string> = { color: "a color", text: "text", number: "a number", list: "a list", font: "a font" };

/**
 * Whether each section's keys name rules it can show. `known`: keys a page
 * already bound, kept even if their rule has gone since (the page says so on
 * reading), so re-saving a page never fails on a key its writer didn't add.
 */
export function checkBindings(sections: Section[], rules: Bindable[], known = new Set<string>(), prefix = "sections"): string[] {
  const byKey = new Map(rules.map((r) => [r.key, r]));
  const errors: string[] = [];
  sections.forEach((s, i) => {
    const info = TEMPLATE_INFO[s.template];
    if (!info.accepts && s.keys.length) errors.push(`${prefix}[${i}].keys: a ${info.name} section binds no rules`);
    s.keys.forEach((k, j) => {
      const r = byKey.get(k);
      if (!r) {
        if (!known.has(k)) {
          const near = [...byKey.keys()].filter((x) => section(x) === section(k));
          errors.push(`${prefix}[${i}].keys[${j}]: no rule "${k}"${near.length ? `; this brand has ${near.slice(0, 12).join(", ")}` : ""}`);
        }
        return;
      }
      if (info.accepts && !info.accepts(r)) {
        errors.push(`${prefix}[${i}].keys[${j}]: a ${info.name} section shows ${info.binds}; ${k} is ${TYPE_WORD[r.type]}${info.accepts === hasAssets && !hasAssets(r) ? " with no assets" : ""}`);
      }
    });
  });
  return errors;
}

// ---- comparing --------------------------------------------------------------

/** JSON with object keys sorted: jsonb gives keys back in its own order, so raw JSON can't be compared. */
export function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

export const samePages = (a: SnapPage[] | null, b: SnapPage[] | null) => canon(a ?? []) === canon(b ?? []);

/** Which pages differ between two snapshots, by slug, for a version's summary: "page:logo". */
export function changedPages(before: SnapPage[] | null, after: SnapPage[]): string[] {
  const was = new Map((before ?? []).map((p) => [p.slug, canon(p)]));
  const now = new Map(after.map((p) => [p.slug, canon(p)]));
  return [...new Set([...was.keys(), ...now.keys()])].filter((s) => was.get(s) !== now.get(s)).map((s) => `page:${s}`);
}

// ---- a first layout ---------------------------------------------------------

const PAGE_TITLES: Record<string, string> = { color: "Color", logo: "Logo", type: "Typography", tone: "Voice and tone", imagery: "Imagery" };
const titleOf = (s: string) => PAGE_TITLES[s] ?? s[0].toUpperCase() + s.slice(1).replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();

type Draft = { slug: string; title: string; sections: SectionInput[] };

/**
 * Pages laid out from a brand's rules, for a brand that has none: an Overview
 * (cover and palette), then a page per section of keys with the templates its
 * rules fit. Every rule lands somewhere; what fits no template goes in a Text
 * section. The same split the builder prototype showed.
 */
export function initialPages(all: Bindable[], brand: string): Draft[] {
  // One per key: the page binds keys, and a key's context versions share a type.
  const rules = all.filter((r, i) => all.findIndex((x) => x.key === r.key) === i);
  const keysOf = (rs: Bindable[]) => rs.map((r) => r.key);
  const colors = rules.filter((r) => r.type === "color");
  const pages: Draft[] = [
    {
      slug: "overview",
      title: "Overview",
      sections: [
        { template: "cover", title: brand, body: `How ${brand} looks, sounds and is used.` },
        ...(colors.length ? [{ template: "palette" as const, title: "At a glance", keys: keysOf(colors.slice(0, 4)) }] : []),
      ],
    },
  ];
  for (const s of [...new Set(rules.map((r) => section(r.key)))]) {
    const left = rules.filter((r) => section(r.key) === s);
    const take = (f: (r: Bindable) => boolean) => {
      const got = left.filter(f);
      for (const r of got) left.splice(left.indexOf(r), 1);
      return keysOf(got);
    };
    const sections: SectionInput[] = [];
    const add = (template: Template, keys: string[], title: string) => {
      if (keys.length) sections.push({ template, keys, title } as SectionInput);
    };
    add("palette", take(TEMPLATE_INFO.palette.accepts!), "Palette");
    add("type", take(TEMPLATE_INFO.type.accepts!), "Typefaces");
    add(s === "logo" ? "logos" : "gallery", take(hasAssets), s === "logo" ? "The marks" : "In use");
    add("text", take((r) => TEMPLATE_INFO.text.accepts!(r) && !(r.type === "list" && ["do", "dont"].includes(listStyle(r.key, r.value as (string | number)[])))), "Rules");
    add("dodont", take(TEMPLATE_INFO.dodont.accepts!), "Do and don't");
    // Fonts and colors outside their sections, and anything else: stated in words.
    add("text", take(() => true), "More");
    const slug = s.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
    pages.push({ slug: slug === "overview" ? "overview-2" : slug, title: titleOf(s), sections });
  }
  return pages;
}

// ---- for agents -------------------------------------------------------------

type Readable = Pick<Rule, "key" | "type" | "value" | "usage">;

function ruleLine(r: Readable) {
  const v =
    r.type === "list"
      ? (r.value as (string | number)[]).join("; ")
      : r.type === "font"
        ? (({ family, size, weight }) => [family, weight, size && `${size}px`].filter(Boolean).join(" "))(fontValue(r.value))
        : String(r.value);
  return `- **${ruleLabel(r.key)}** (\`${r.key}\`): ${v}${r.usage ? `. ${r.usage.replace(/\s+/g, " ")}` : ""}`;
}

/** A page as Markdown: what it says and shows, for an agent to read or check its work against. */
export function pageMarkdown(page: Pick<SnapPage, "title" | "sections">, rules: Readable[]): string {
  const byKey = new Map(rules.map((r) => [r.key, r]));
  const out = [`# ${page.title}`];
  for (const s of page.sections) {
    if (s.hidden) continue;
    const head = s.title || TEMPLATE_INFO[s.template].name;
    out.push("", `## ${head}`, `<!-- ${s.template} ${s.id} -->`);
    if (s.body) out.push("", s.body);
    const lines = s.keys.map((k) => (byKey.has(k) ? ruleLine(byKey.get(k)!) : `- \`${k}\`: (no such rule)`));
    if (lines.length) out.push("", ...lines);
    if (s.template === "collection") {
      const p = s.props as { collection?: string; search?: string; query?: string };
      const from = p.collection ? `collection ${p.collection}` : p.search ? `saved search ${p.search}` : "the library";
      out.push("", `Assets from ${from}${p.query ? `, filtered by ${p.query}` : ""}.`);
    }
  }
  return out.join("\n");
}
