import { z } from "zod";
import { COLLECTION_ICONS, type CollectionIcon } from "./collection-icons.ts";
import { SITE_PATH } from "./markdown.ts";
import { fontValue, listStyle, resolve, ruleContext, ruleKey, ruleLabel, section, type Rule, type RuleType } from "./rules.ts";

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
 * history beside its rules. Pages nest by slug (`parent`), three levels deep.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

export const TEMPLATES = [
  "cover",
  "header",
  "text",
  "split",
  "cards",
  "palette",
  "type",
  "logos",
  "dodont",
  "gallery",
  "collection",
  "icons",
  "links",
  "pages",
  "diagram",
  "updates",
  "annotated",
  "specs",
  "specimen",
  "pattern",
  "chart",
  "copy",
  "faq",
  "embed",
  "request",
] as const;
export type Template = (typeof TEMPLATES)[number];

export const WIDTHS = ["text", "wide", "full"] as const;
/** A section's ground. color and image take theirs from `background`; pattern is the theme's device. */
export const TONES = ["plain", "tint", "brand", "panel", "dark", "color", "image", "pattern"] as const;
export type Tone = (typeof TONES)[number];
/** Who may read a page or section on a portal, ranked: members see what partners see, partners what everyone sees. */
export const AUDIENCES = ["everyone", "partners", "members"] as const;
export type Audience = (typeof AUDIENCES)[number];
/** ponytail: hard-coded caps; add LIMIT_PAGES when an operator asks. */
export const MAX_PAGES = 200;
const MAX_SECTIONS = 60;
const MAX_ITEMS = 60;

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
    /** What its items are, in words. Null: it takes none. */
    items: string | null;
    /** The item fields it can't do without: each group needs one of its fields. */
    needs?: (keyof Item)[][];
    width: (typeof WIDTHS)[number];
    columns: number;
    tone: Tone;
    /** A section that shows the template off, for the catalog, the builder and the fixtures. */
    example: SectionInput;
  }
> = {
  cover: {
    name: "Cover",
    use: "The opening: the brand's name big on its color, a line under it, the palette as a strip. First on a first page.",
    binds: null,
    accepts: null,
    items: null,
    width: "full",
    columns: 1,
    tone: "brand",
    example: { template: "cover", eyebrow: "Brand guidelines", title: "Blender", lede: "How Blender looks, sounds and is used." },
  },
  header: {
    name: "Header",
    use: "A band that opens a part of a long page: its number, eyebrow, title and lede, on its tone.",
    binds: null,
    accepts: null,
    items: null,
    width: "full",
    columns: 1,
    tone: "tint",
    example: { template: "header", eyebrow: "Part two", title: "Using the logo", lede: "Where it goes, and where it never does." },
  },
  text: {
    name: "Text",
    use: "Prose in Markdown, and rules read as statements: a voice, a minimum size, a list of habits.",
    binds: "text, number and list rules",
    accepts: (r) => r.type === "text" || r.type === "number" || r.type === "list",
    items: null,
    width: "text",
    columns: 1,
    tone: "plain",
    example: {
      template: "text",
      eyebrow: "01",
      title: "Voice",
      lede: "Plain and warm, like a friend who knows the subject.",
      body: "We write short sentences and name things the way our readers do.",
      keys: ["tone.always", "tone.avoid"],
      aside: "Unsure? Read it out loud, or see how [the mark](/logo) speaks.",
    },
  },
  split: {
    name: "Split",
    use: "Words beside an image: a rule's picture, or props.image.",
    binds: "rules with assets",
    accepts: hasAssets,
    items: null,
    width: "wide",
    columns: 1,
    tone: "plain",
    example: { template: "split", title: "The mark", body: "Our mark is a blend of two shapes.", keys: ["logo.mark"], props: { flip: true } },
  },
  cards: {
    name: "Cards",
    use: "A card per point: each entry of the lists it binds, each text rule, then each item.",
    binds: "text and list rules",
    accepts: (r) => r.type === "text" || r.type === "list",
    items: "a card: title (needed), text, asset, icon, link, label",
    needs: [["title"]],
    width: "wide",
    columns: 3,
    tone: "plain",
    example: {
      template: "cards",
      title: "What we stand for",
      keys: ["tone.always"],
      items: [
        { title: "Free", text: "Free to use, for any purpose, forever.", icon: "heart" },
        { title: "Open", text: "Made in the open by a community.", icon: "users", link: "https://www.blender.org/about/", label: "About" },
      ],
    },
  },
  palette: {
    name: "Color palette",
    use: "Swatches with their values and contrast.",
    binds: "color rules",
    accepts: (r) => r.type === "color",
    items: null,
    width: "wide",
    columns: 3,
    tone: "plain",
    example: { template: "palette", title: "Palette", keys: ["color.primary", "color.secondary", "color.background"], props: { show: ["hex", "cmyk", "pantone"], matrix: true } },
  },
  type: {
    name: "Type specimen",
    use: "Faces set in themselves, and the type scale; readers can type their own text.",
    binds: "font rules and a type scale (a list of numbers)",
    accepts: (r) => r.type === "font" || scale(r),
    items: null,
    width: "wide",
    columns: 1,
    tone: "plain",
    example: { template: "type", title: "Typefaces", keys: ["type.heading", "type.primary", "type.scale"], props: { sample: "Blend it your way", roles: true } },
  },
  logos: {
    name: "Logo showcase",
    use: "Marks on light and dark and on the colors it binds, ready to download one by one or as a kit.",
    binds: "rules with assets (the logo files), and color rules to set them on",
    accepts: (r) => hasAssets(r) || r.type === "color",
    items: "a pair never to use: asset (a mark's picture) and key (a color), both needed; verdict dont; caption",
    needs: [["asset"], ["key"]],
    width: "wide",
    columns: 2,
    tone: "plain",
    example: { template: "logos", title: "The marks", keys: ["logo.mark", "logo.wordmark", "color.primary"], tone: "panel" },
  },
  dodont: {
    name: "Do / Don't",
    use: "Side by side, green and red. A list named like always, do or prefer is a do; never, avoid or dont a don't.",
    binds: "list rules",
    accepts: (r) => r.type === "list" && !scale(r),
    items: "a do or a don't with its picture: verdict (needed), asset, title, text, caption",
    needs: [["verdict"]],
    width: "wide",
    columns: 2,
    tone: "plain",
    example: {
      template: "dodont",
      title: "Do and don't",
      keys: ["logo.always", "logo.neverDo"],
      items: [
        { verdict: "do", title: "Give it room", text: "Clear space on every side, as wide as the mark's dot." },
        { verdict: "dont", title: "Stretch it", text: "Scale it evenly, never on one axis." },
      ],
    },
  },
  gallery: {
    name: "Gallery",
    use: "In-use examples: the pictures of the rules it binds.",
    binds: "rules with assets",
    accepts: hasAssets,
    items: "a picture: asset (needed), caption, title, download, span (2: two cells wide in bento)",
    needs: [["asset"]],
    width: "full",
    columns: 3,
    tone: "plain",
    example: { template: "gallery", title: "In use", body: "Real work, on real surfaces.", keys: ["imagery.examples"], tone: "tint", props: { layout: "bento" } },
  },
  collection: {
    name: "Collection",
    use: "Live assets from the library: a collection, a saved search, or a query. Only approved, current, unexpired assets show; new ones appear as they are approved.",
    binds: null,
    accepts: null,
    items: null,
    width: "full",
    columns: 4,
    tone: "plain",
    example: { template: "collection", title: "Posters", props: { query: "tag=poster&type=image", limit: 12, layout: "grid" } },
  },
  icons: {
    name: "Icon set",
    use: "The brand's icons from the library, live: a collection, a saved search or a query, and everything tagged icon when none is set; by name, 96 at most unless limit says. One-color icons take the section's text color; readers find one by name, copy its SVG or download it.",
    binds: null,
    accepts: null,
    items: null,
    width: "wide",
    columns: 1,
    tone: "plain",
    example: { template: "icons", title: "Icons", body: "Drawn on a 24px grid with a 2px stroke.", props: { query: "tag=icon", size: "medium" } },
  },
  links: {
    name: "Links",
    use: "Resources to open or download: the files of the rules it binds, then items that link out or hand over a file.",
    binds: "rules with assets",
    accepts: hasAssets,
    items: "a resource: title or asset, link or asset, text, label",
    needs: [
      ["title", "asset"],
      ["link", "asset"],
    ],
    width: "wide",
    columns: 2,
    tone: "plain",
    example: {
      template: "links",
      title: "Downloads",
      keys: ["logo.mark"],
      items: [{ title: "Press kit", text: "Logos, screenshots and facts.", link: "https://www.blender.org/about/press/", label: "Web" }],
    },
  },
  pages: {
    name: "Pages",
    use: "Where to go next: a page's children as cards with their cover and lede, or the pages its items pick. A list with depth reads as a table of contents.",
    binds: null,
    accepts: null,
    items: "a page to feature: link /slug (needed), title, text, asset",
    needs: [["link"]],
    width: "wide",
    columns: 3,
    tone: "plain",
    example: { template: "pages", title: "Using the logo", props: { from: "logo", layout: "cards" } },
  },
  diagram: {
    name: "Diagram",
    use: "A logo rule drawn over the real mark: its clear space, its minimum size at true size, where it sits on a page, or beside a partner's mark.",
    binds: "a rule with assets (the mark) and number rules (clear space in x, sizes in px or mm)",
    accepts: (r) => hasAssets(r) || r.type === "number",
    items: "a co-brand partner: asset (their mark, needed), title",
    needs: [["asset"]],
    width: "wide",
    columns: 1,
    tone: "plain",
    example: { template: "diagram", title: "Clear space", keys: ["logo.mark", "logo.clearSpace"], props: { kind: "clearspace" } },
  },
  updates: {
    name: "What's new",
    use: "The latest publishes, newest first: their notes, and the pages and rules each one changed.",
    binds: null,
    accepts: null,
    items: null,
    width: "text",
    columns: 1,
    tone: "plain",
    example: { template: "updates", title: "What's new", props: { limit: 5 } },
  },
  annotated: {
    name: "Annotated image",
    use: "A picture (props.image) with numbered hotspots, each explained beside it: the parts of a logo, a layout, a product shot.",
    binds: null,
    accepts: null,
    items: "a hotspot: at (needed, [x, y] in percent from the top left), title, text, key (the rule it points at)",
    needs: [["at"]],
    width: "wide",
    columns: 1,
    tone: "plain",
    example: {
      template: "annotated",
      title: "Anatomy of the logo",
      items: [
        { at: [13, 50], title: "The mark", text: "An orange circle holding a blue dot." },
        { at: [64, 50], title: "The wordmark", text: "Set in its own letters; never retyped." },
      ],
    },
  },
  specs: {
    name: "Specs table",
    use: "Measurements in a table: a row per rule, a column per context (the section's contexts), each value in its unit.",
    binds: "number and text rules",
    accepts: (r) => r.type === "number" || r.type === "text",
    items: null,
    width: "wide",
    columns: 1,
    tone: "plain",
    example: { template: "specs", title: "Sizes", keys: ["logo.minSize", "logo.clearSpace"], contexts: ["default", "print"] },
  },
  specimen: {
    name: "Token specimen",
    use: "Design tokens drawn: spacing as bars, radii as corners, shadows on cards, motion as a moving dot, a grid over a frame.",
    binds: "number, list and text rules (a shadow is CSS in a text rule; motion a number in ms)",
    accepts: (r) => r.type === "number" || r.type === "list" || r.type === "text",
    items: null,
    width: "wide",
    columns: 1,
    tone: "plain",
    example: { template: "specimen", title: "Spacing", keys: ["space.scale"], props: { kind: "spacing" } },
  },
  pattern: {
    name: "Pattern",
    use: "The brand's pattern tiled at a few scales on its colors: props.asset, else a bound rule's picture, else the theme's device.",
    binds: "rules with assets (the pattern), and color rules (the grounds)",
    accepts: (r) => hasAssets(r) || r.type === "color",
    items: null,
    width: "wide",
    columns: 3,
    tone: "plain",
    example: { template: "pattern", title: "Pattern", keys: ["color.primary", "color.background"], props: { scales: [0.5, 1, 2] } },
  },
  chart: {
    name: "Chart colors",
    use: "A sample chart in the brand's colors, a series per color in order, with neighbors that are hard to tell apart flagged.",
    binds: "color rules, in series order",
    accepts: (r) => r.type === "color",
    items: null,
    width: "wide",
    columns: 1,
    tone: "plain",
    example: { template: "chart", title: "Charts", keys: ["color.primary", "color.secondary", "color.ink"], props: { kind: "bar" } },
  },
  copy: {
    name: "Copy",
    use: "Words to paste as they are, each with a copy button and its length limit, and a generator: a form fills props.template (a signature, a credit line) in the reader's browser; nothing is stored.",
    binds: "text rules (their spec: copy, max)",
    accepts: (r) => r.type === "text",
    items: null,
    width: "text",
    columns: 1,
    tone: "plain",
    example: {
      template: "copy",
      title: "Giving credit",
      keys: ["brand.mission"],
      props: {
        form: [
          { name: "project", label: "Your project" },
          { name: "author", label: "Your name" },
        ],
        template: "{project} by {author}, made with Blender (blender.org)",
      },
    },
  },
  faq: {
    name: "Questions",
    use: "Questions and their answers, opened one at a time, or terms and their meanings: a glossary.",
    binds: null,
    accepts: null,
    items: "a question or a term: title (needed), text (the answer, Markdown)",
    needs: [["title"]],
    width: "text",
    columns: 1,
    tone: "plain",
    example: {
      template: "faq",
      title: "Questions",
      items: [
        { title: "Can I use the logo for my add-on?", text: "To point to Blender, yes. Never as your add-on's own logo." },
        { title: "Can I change its colors?", text: "No. Keep its orange, blue and white." },
      ],
      props: { layout: "accordion" },
    },
  },
  embed: {
    name: "Embed",
    use: "A live frame from Figma, YouTube (youtube-nocookie.com), Vimeo, Loom or Google Docs. Any other https address shows as a link card.",
    binds: null,
    accepts: null,
    items: null,
    width: "wide",
    columns: 1,
    tone: "plain",
    example: {
      template: "embed",
      title: "Big Buck Bunny",
      body: "An open movie, made with Blender.",
      props: { url: "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ", aspect: "16:9" },
    },
  },
  request: {
    name: "Request",
    use: "Where portal readers ask the brand team: for an asset, a review of their work, or a question. It is sent with the page and section it came from.",
    binds: null,
    accepts: null,
    items: null,
    width: "text",
    columns: 1,
    tone: "panel",
    example: { template: "request", title: "Need something else?", props: { kind: "asset", prompt: "The logo in another format or size? Ask the brand team." } },
  },
};

// ---- schemas ----------------------------------------------------------------

export const pageSlug = z.string().max(60).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use a slug, e.g. logo or voice-and-tone");
export const sectionId = z.string().regex(/^[a-z0-9_-]{1,40}$/i, "Letters, digits, - and _");

const unique = (a: unknown[]) => new Set(a).size === a.length;
const pct = z.number().min(0).max(100);

/** https:, mailto:, or a link inside the brand (SITE_PATH). */
export const siteLink = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine((s) => /^(https?:|mailto:)/i.test(s) || SITE_PATH.test(s), "A link: https://, mailto:, /page, /page#section or #section");

/** A free thing a template lists: a don't with its picture, a card, a resource, a page to feature. */
export const Item = z.strictObject({
  key: ruleKey.optional().describe("A rule it shows, by key"),
  asset: z.uuid().optional().describe("An image, video or file, from search_assets"),
  title: z.string().trim().max(200).optional(),
  text: z.string().trim().max(4000).optional().describe("Markdown"),
  verdict: z.enum(["do", "dont"]).optional().describe("A do (green) or a don't (red)"),
  caption: z.string().trim().max(500).optional().describe("Under the media; the asset's description when left out"),
  link: siteLink.optional(),
  label: z.string().trim().max(40).optional().describe("A small tag: Figma, PDF, Partners only"),
  // Checked like a page's icon, but advertised as a string: the tool schemas list the icons once, on the page.
  icon: z
    .string()
    .refine((v) => (COLLECTION_ICONS as readonly string[]).includes(v), "One of the icons a page takes")
    .optional()
    .describe("One of the icons a page takes"),
  download: z.boolean().optional().describe("false: for reference, never offered as a download"),
  span: z.number().int().min(1).max(2).optional().describe("gallery bento: 2 takes two cells"),
  at: z.tuple([pct, pct]).optional().describe("annotated: [x, y], % from the top left"),
  level: z.number().int().min(0).max(2).optional().describe("cards tree: 0 at the top"),
});
export type Item = z.output<typeof Item>;

const image = z.uuid().optional().describe("An asset id, from search_assets");
/** What a diagram draws. lib/diagram.ts holds the geometry. */
export const DIAGRAMS = ["clearspace", "minsize", "placement", "cobrand"] as const;

/** What a request section asks the brand team for. A portal's door asks for access, the fourth kind a request row holds. */
export const ASKS = ["asset", "review", "question"] as const;
export const REQUEST_KINDS = ["access", ...ASKS] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

/**
 * The hosts an embed section frames, as these services' embed codes write
 * them; proxy.ts frame-src lets each in (pages.test.ts checks). Any other
 * https address still saves, and readers get a link card to it: a watch page
 * (youtube.com, figma.com without www) is a link, not a frame.
 */
export const EMBED_HOSTS = ["www.figma.com", "embed.figma.com", "www.youtube-nocookie.com", "player.vimeo.com", "www.loom.com", "docs.google.com"] as const;

/** Whether an embed section frames its address, or shows it as a link card. */
export function framed(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (EMBED_HOSTS as readonly string[]).includes(u.hostname);
  } catch {
    return false;
  }
}

/** A copy section's form field in its template: `{project}`. */
const SLOT = /\{(\w+)\}/g;

/** A copy section's template with the reader's words in its slots; a slot left blank keeps its `{name}`, so the gap shows. */
export const fillSlots = (template: string, values: Record<string, string>) => template.replace(SLOT, (slot, name: string) => values[name]?.trim() || slot);

/** Each template's own settings. Strict: a misspelled one is an error, not ignored. */
/** Logos' and icons' size: said once, it goes into the page tools' schemas once. */
const SIZE = "How big each is drawn in its tile";

/** A live section's source (collection, icons): the library, narrowed. */
const LIVE = {
  collection: z.uuid().optional().describe("A collection's id"),
  search: z.uuid().optional().describe("A saved search's id"),
  query: z
    .string()
    .max(2000)
    .optional()
    .describe("Library query string: q=poster&type=image&tag=campaign&f.channel=web; narrows the collection or search"),
  sort: z.enum(["newest", "oldest", "name"]).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  downloads: z.boolean().optional().describe("Offer downloads; true when left out"),
};

export const TEMPLATE_PROPS = {
  cover: z.strictObject({
    image: image.describe("A background image instead of the brand color"),
    video: z.uuid().optional().describe("A muted loop over the image, its poster"),
    align: z.enum(["start", "center", "end"]).optional(),
    height: z.enum(["auto", "tall", "screen"]).optional(),
    strip: z.boolean().optional().describe("The palette as a strip; true when left out"),
    mark: z.enum(["home", "always", "never"]).optional().describe("Logo above the title"),
  }),
  header: z.strictObject({ image: image.describe("A picture in the band") }),
  text: z.strictObject({}),
  split: z.strictObject({
    image: image.describe("Shown beside the words; else the first bound rule's picture"),
    flip: z.boolean().optional().describe("Image on the left"),
    ratio: z.enum(["even", "words", "picture"]).optional().describe("The wider side"),
    align: z.enum(["start", "center"]).optional(),
    fit: z.enum(["auto", "fill", "whole"]).optional(),
  }),
  cards: z.strictObject({ layout: z.enum(["cards", "list", "stats", "checklist", "tree"]).optional() }),
  // Booleans are off when left out, kit aside. Descriptions stay short: each is in every page tool's schema.
  palette: z.strictObject({
    show: z
      .array(z.enum(["hex", "rgb", "hsl", "cmyk", "pantone", "ral", "token", "css"]))
      .max(8)
      .optional()
      .describe("Values listed; all it has when left out"),
    media: z.enum(["screen", "print"]).optional().describe("Values it opens on; screen when left out"),
    matrix: z.boolean().optional().describe("Contrast of every pair"),
    ase: z.boolean().optional().describe("An .ase swatch download"),
    simulate: z.boolean().optional().describe("Color blindness views"),
  }),
  type: z.strictObject({
    sample: z.string().max(200).optional().describe("The specimen's starting text"),
    roles: z.boolean().optional().describe("A table of roles"),
    glyphs: z.boolean().optional().describe("Character sets"),
    embed: z.boolean().optional().describe("Code to load the faces"),
    formula: z
      .strictObject({ base: z.number().min(4).max(200), ratio: z.number().min(1).max(4), steps: z.number().int().min(1).max(12) })
      .optional()
      .describe("base in px"),
  }),
  logos: z.strictObject({
    kit: z.boolean().optional().describe("A zip of every mark; true when left out"),
    ask: z.boolean().optional().describe("Which mark for which context"),
    size: z.enum(["medium", "small", "large"]).optional().describe(SIZE),
    backdrop: z.enum(["checker", "light", "dark"]).optional(),
  }),
  dodont: z.strictObject({ layout: z.enum(["pairs", "grid", "rows"]).optional() }),
  gallery: z.strictObject({ layout: z.enum(["grid", "bento", "carousel", "collage", "crops"]).optional() }),
  collection: z
    .strictObject({
      collection: LIVE.collection,
      search: LIVE.search,
      query: LIVE.query,
      sort: LIVE.sort,
      limit: LIVE.limit.describe("At most this many; 24 when left out"),
      layout: z.enum(["grid", "masonry", "list"]).optional(),
      downloads: LIVE.downloads,
    })
    .refine((p) => !(p.collection && p.search), "A collection or a saved search, not both"),
  icons: z
    .strictObject({
      collection: LIVE.collection,
      search: LIVE.search,
      query: LIVE.query,
      // Their defaults (by name, 96) are in list_templates: every word here goes into each page tool's schema.
      sort: LIVE.sort,
      limit: LIVE.limit,
      size: z.enum(["medium", "small", "large"]).optional().describe(SIZE),
      downloads: LIVE.downloads,
    })
    .refine((p) => !(p.collection && p.search), "A collection or a saved search, not both"),
  links: z.strictObject({ layout: z.enum(["cards", "list"]).optional() }),
  pages: z.strictObject({
    from: pageSlug.optional().describe("The page whose children it shows; this page when left out"),
    layout: z.enum(["cards", "list"]).optional(),
    depth: z.number().int().min(1).max(3).optional().describe("How many levels a list goes down: a table of contents"),
  }),
  diagram: z.strictObject({
    kind: z.enum(DIAGRAMS).optional().describe("clearspace when left out"),
    positions: z.array(z.enum(["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"])).max(9).optional().describe("placement: where it may sit"),
    partner: z.string().trim().max(60).optional().describe("cobrand: their name"),
    separator: z.enum(["line", "x", "none"]).optional().describe("cobrand: line when left out"),
  }),
  // collection's limit, so the prop keeps one kind (mergedProps); checkSection holds it to 20 here.
  updates: z.strictObject({ limit: z.number().int().min(1).max(200).optional().describe("How many publishes; 5 when left out, 20 at most") }),
  annotated: z.strictObject({ image: z.uuid().optional() }),
  specs: z.strictObject({}),
  specimen: z.strictObject({ kind: z.enum(["spacing", "radius", "shadow", "motion", "grid"]).optional() }),
  pattern: z.strictObject({
    asset: z.uuid().optional().describe("The tile"),
    scales: z.array(z.number().min(0.1).max(10)).min(1).max(6).optional().describe("Tile sizes, as multiples"),
  }),
  chart: z.strictObject({ kind: z.enum(["bar", "line", "donut"]).optional() }),
  copy: z.strictObject({
    form: z
      .array(z.strictObject({ name: z.string().max(30).regex(/^\w+$/, "Letters, digits and _"), label: z.string().trim().min(1).max(60) }))
      .max(8)
      .refine((f) => unique(f.map((x) => x.name)), "Each name once")
      .optional()
      .describe("Fields readers fill"),
    template: z.string().trim().max(2000).optional().describe("Their words go in its {name} slots"),
  }),
  faq: z.strictObject({ layout: z.enum(["accordion", "definitions"]).optional() }),
  embed: z.strictObject({
    url: z
      .url({ protocol: /^https$/, error: "An https:// address" })
      .max(2000)
      .optional()
      .describe("https"),
    aspect: z.enum(["16:9", "4:3", "1:1", "auto"]).optional(),
  }),
  request: z.strictObject({ kind: z.enum(ASKS).optional(), prompt: z.string().trim().max(300).optional().describe("What to ask for") }),
} satisfies Record<Template, z.ZodType>;

const Background = z.strictObject({
  color: ruleKey.optional().describe("tone color: the color rule it is set on"),
  image: z.uuid().optional().describe("tone image: the picture"),
  scrim: z.number().min(0).max(0.9).optional().describe("tone image: how much to darken it; 0.45 when left out"),
});

/** A section's words, bounded once for the section and for its translations. */
const TEXT = {
  title: z.string().trim().max(300),
  eyebrow: z.string().trim().max(120),
  lede: z.string().trim().max(1000),
  body: z.string().trim().max(20000),
  aside: z.string().trim().max(4000),
};

/** A language as a lowercase tag: ar, en-gb. */
export const LANG = z.string().max(20).regex(/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/, "A language tag in lowercase: ar, en-gb");

/** A section's words in another language. Items line up with the section's by position; null keeps one as written. */
export const SectionText = z
  .strictObject({
    ...TEXT,
    items: z.array(z.strictObject({ title: z.string().trim().max(200), text: z.string().trim().max(4000), caption: z.string().trim().max(500) }).partial().nullable()).max(MAX_ITEMS),
  })
  .partial();
export type SectionText = z.output<typeof SectionText>;

const base = {
  id: sectionId.optional().describe("Kept across edits; made up when left out"),
  title: TEXT.title.optional(),
  body: TEXT.body.optional().describe("Markdown (GFM), shown under the title"),
  width: z.enum(WIDTHS).optional().describe("text (a reading column), wide, or full bleed; the template's default when left out"),
  columns: z.number().int().min(1).max(4).optional(),
  tone: z
    .enum(TONES)
    .optional()
    .describe("The ground. panel: the second surface; color and image: set in background; pattern: the theme's device"),
  hidden: z.boolean().optional().describe("Kept, but not shown to readers"),
  keys: z.array(ruleKey).max(100).refine(unique, "Each key once").optional().describe("The rules it shows, by key, in order"),
  eyebrow: TEXT.eyebrow.optional().describe("A small line above the title: a number, a chapter"),
  lede: TEXT.lede.optional().describe("A line or two under the title, set large; plain text"),
  aside: TEXT.aside.optional().describe("Markdown in a ruled column beside the body"),
  tab: z.string().trim().min(1).max(40).optional().describe("Sections sharing a tab name show under one tab"),
  space: z.enum(["tight", "loose"]).optional().describe("Room above it"),
  background: Background.optional().describe("For tone color and tone image"),
  items: z.array(Item).max(MAX_ITEMS).optional().describe("What the template lists; list_templates says which take items"),
  audience: z.enum(AUDIENCES).optional().describe("On portals: everyone let in, partners (by a password or an approved request) or members"),
  contexts: z
    .array(ruleContext)
    .min(2)
    .max(8)
    .refine(unique, "Each context once")
    .optional()
    .describe('A tab per context, rules resolved for each: ["default", "dark-background"]; default: no context'),
  only: ruleContext.optional().describe("Shown only in this context"),
  translations: z.record(LANG, SectionText).optional().describe("Its words by language tag; what is left out falls back"),
};

/** The optional fields a stored section carries only when set (D5): writing their defaults would change every page's canon. */
const OPTIONAL = ["eyebrow", "lede", "aside", "tab", "space", "background", "items", "audience", "contexts", "only", "translations"] as const;

// Props come in as their own type parameter: indexing TEMPLATE_PROPS by a generic template typed every prop as never.
const variant = <T extends Template, P extends z.ZodType>(t: T, props: P) =>
  z.strictObject({ ...base, template: z.literal(t), props: props.optional() });

/** One section, checked strictly against its own template. Internal to parseSections; the tools advertise SectionWire. */
export const SectionInput = z.discriminatedUnion("template", [
  variant("cover", TEMPLATE_PROPS.cover),
  variant("header", TEMPLATE_PROPS.header),
  variant("text", TEMPLATE_PROPS.text),
  variant("split", TEMPLATE_PROPS.split),
  variant("cards", TEMPLATE_PROPS.cards),
  variant("palette", TEMPLATE_PROPS.palette),
  variant("type", TEMPLATE_PROPS.type),
  variant("logos", TEMPLATE_PROPS.logos),
  variant("dodont", TEMPLATE_PROPS.dodont),
  variant("gallery", TEMPLATE_PROPS.gallery),
  variant("collection", TEMPLATE_PROPS.collection),
  variant("icons", TEMPLATE_PROPS.icons),
  variant("links", TEMPLATE_PROPS.links),
  variant("pages", TEMPLATE_PROPS.pages),
  variant("diagram", TEMPLATE_PROPS.diagram),
  variant("updates", TEMPLATE_PROPS.updates),
  variant("annotated", TEMPLATE_PROPS.annotated),
  variant("specs", TEMPLATE_PROPS.specs),
  variant("specimen", TEMPLATE_PROPS.specimen),
  variant("pattern", TEMPLATE_PROPS.pattern),
  variant("chart", TEMPLATE_PROPS.chart),
  variant("copy", TEMPLATE_PROPS.copy),
  variant("faq", TEMPLATE_PROPS.faq),
  variant("embed", TEMPLATE_PROPS.embed),
  variant("request", TEMPLATE_PROPS.request),
]);
export type SectionInput = z.input<typeof SectionInput>;

/** A zod schema as JSON Schema, without what doesn't change its meaning. */
function shapeOf(s: z.ZodType) {
  const j = z.toJSONSchema(s, { io: "input" }) as Record<string, unknown>;
  delete j.$schema;
  delete j.description;
  return canon(j);
}

/**
 * Every template's props in one strict object, for the advertised schema: one
 * copy of each prop instead of one per template. A prop two templates share
 * keeps one shape; enums merge their values. Anything else is a clash, and
 * throws. Each prop's description names the templates that take it.
 */
export function mergedProps(props: Record<string, z.ZodObject> = TEMPLATE_PROPS) {
  const merged = new Map<string, { schema: z.ZodType; from: { t: string; about?: string; values?: string[] }[] }>();
  for (const [t, obj] of Object.entries(props)) {
    for (const [name, raw] of Object.entries(obj.shape as Record<string, z.ZodType>)) {
      const s = raw instanceof z.ZodOptional ? (raw.unwrap() as z.ZodType) : raw;
      const from = { t, about: raw.description ?? s.description, values: s instanceof z.ZodEnum ? (s.options as string[]) : undefined };
      const had = merged.get(name);
      if (!had) {
        merged.set(name, { schema: s, from: [from] });
        continue;
      }
      if (had.schema instanceof z.ZodEnum && s instanceof z.ZodEnum) {
        had.schema = z.enum([...new Set([...had.schema.options, ...s.options])] as [string, ...string[]]);
      } else if (shapeOf(had.schema) !== shapeOf(s)) {
        throw new Error(`props.${name} is one thing in ${had.from.map((f) => f.t).join(", ")} and another in ${t}: give one of them another name`);
      }
      had.from.push(from);
    }
  }
  // A merged enum no longer says which template takes which value; its description does.
  // Templates that say the same (collection and icons share their source) say it once.
  const describe = (from: { t: string; about?: string; values?: string[] }[]) => {
    const said = new Map<string, string[]>();
    for (const { t, about, values } of from) {
      const text = about ?? (from.length > 1 && values ? values.join(", ") : "");
      said.set(text, [...(said.get(text) ?? []), t]);
    }
    return [...said].map(([text, ts]) => (text ? `${ts.join(", ")}: ${text}` : ts.join(", "))).join("; ");
  };
  return z.strictObject(Object.fromEntries([...merged].map(([name, m]) => [name, m.schema.optional().describe(describe(m.from))])));
}

/** What save_page, edit_page's add op, PUT and PATCH advertise. parseSections still checks each section against its own template. */
export const SectionWire = z.strictObject({ ...base, template: z.enum(TEMPLATES), props: mergedProps().optional() });

export type Background = z.output<typeof Background>;

/** A section as stored: every setting filled in, and the optional ones only when set. */
export type Section = {
  id: string;
  template: Template;
  title: string;
  body: string;
  width: (typeof WIDTHS)[number];
  columns: number;
  tone: Tone;
  hidden: boolean;
  keys: string[];
  props: Record<string, unknown>;
} & Partial<{
  eyebrow: string;
  lede: string;
  aside: string;
  tab: string;
  space: "tight" | "loose";
  background: Background;
  items: Item[];
  audience: Audience;
  contexts: string[];
  only: string;
  translations: Record<string, SectionText>;
}>;

/** How a page sits in the site: a chapter of the book, or a front with no nav column, on-this-page or pager (D28). */
export const PAGE_LAYOUTS = ["book", "landing"] as const;
export type PageLayout = (typeof PAGE_LAYOUTS)[number];

/** A page's words in another language. */
const PageText = z.strictObject({ title: z.string().trim().max(120), eyebrow: TEXT.eyebrow, lede: TEXT.lede }).partial();
export type PageText = z.output<typeof PageText>;

/** A page's own fields beside its title and sections. On save, left out keeps a value and null clears it. */
const PageMeta = {
  parent: pageSlug.nullable().optional().describe("Its parent page; null for the top. Three levels at most"),
  eyebrow: z.string().trim().max(120).nullable().optional(),
  lede: z.string().trim().max(1000).nullable().optional(),
  cover: z.uuid().nullable().optional().describe("Its header and card image"),
  icon: z.enum(COLLECTION_ICONS).nullable().optional(),
  audience: z.enum(AUDIENCES).optional().describe("On portals: who may read it"),
  tabs: z.boolean().optional().describe("Its child pages as tabs across its top"),
  layout: z.enum(PAGE_LAYOUTS).optional().describe("landing: no nav column, on-this-page or pager, for a home or campaign page; book when left out"),
  translations: z.record(LANG, PageText).nullable().optional().describe("Its words by language tag"),
};

/** What save_page and PUT take. Sections are advertised flat (SectionWire); parseSections checks each strictly. */
export const PageInput = z.strictObject({
  title: z.string().trim().min(1).max(120),
  hidden: z.boolean().optional().describe("Kept, but not published"),
  position: z.number().int().min(0).optional().describe("Where among the brand's pages, from 0; the end for a new page"),
  sections: z.array(SectionWire).max(MAX_SECTIONS).describe("The whole page, top to bottom"),
  ...PageMeta,
});

/** A section already on the page, by id. applyOps finds it or names the ones there are, so sectionId's pattern would only repeat in the schema. */
const sectionRef = z.string();

/** One change to a page, for edit_page: applied in order, checked together. */
export const PageOp = z.discriminatedUnion("op", [
  z.strictObject({
    op: z.literal("add"),
    section: SectionWire,
    after: sectionRef.nullable().optional().describe("Add it after this section; null for the top; the end when left out"),
  }),
  z.strictObject({
    op: z.literal("update"),
    id: sectionRef,
    set: z
      .record(z.string(), z.unknown())
      .describe("What changes, e.g. { title, keys, props }; null clears a field. props is replaced whole; template can change too"),
  }),
  z.strictObject({ op: z.literal("move"), id: sectionRef, after: sectionRef.nullable().describe("After this section; null for the top") }),
  z.strictObject({ op: z.literal("remove"), id: sectionRef }),
  z.strictObject({
    op: z.literal("page"),
    set: z
      .strictObject({
        title: z.string().trim().min(1).max(120),
        hidden: z.boolean(),
        position: z.number().int().min(0),
        slug: pageSlug.describe("Renames it; the old slug keeps working"),
        ...PageMeta,
      })
      .partial(),
  }),
]);
export type PageOp = z.output<typeof PageOp>;
/** The page's own fields an edit changes, folded from its `page` ops. */
export type PagePatch = Extract<PageOp, { op: "page" }>["set"];

/** A page as history and publishing keep it. Optional fields are there only when set (D5). */
export type SnapPage = { slug: string; title: string; position: number; hidden: boolean; sections: Section[] } & Partial<{
  parent: string;
  eyebrow: string;
  lede: string;
  cover: string;
  icon: CollectionIcon;
  audience: Audience;
  tabs: true;
  aliases: string[];
  /** Last content change; left out of every comparison. */
  updatedAt: string;
  /** Only landing: a book page, the default, leaves it out (D5). */
  layout: "landing";
  translations: Record<string, PageText>;
}>;

/**
 * Its words in `lang`, field by field: the language's own, then its base
 * language's (ar for ar-eg), then as written. Empty is missing. Items go by
 * position, each field by itself; `translations` stays for the caller to keep or drop.
 */
export function pickText<T extends { translations?: Record<string, object> | null }>(x: T, lang: string | null): T {
  type Words = Record<string, unknown>;
  const found = (lang ? [x.translations?.[lang.split("-")[0]], x.translations?.[lang]] : []).filter((t): t is Words => !!t);
  if (!found.length) return x;
  // The base language first, then the language itself over it. Only words: items is an array, never a string.
  const over = (into: object, from: Words[]) => {
    const out: Words = { ...into };
    for (const t of from) for (const [k, v] of Object.entries(t)) if (typeof v === "string" && v.trim()) out[k] = v;
    return out;
  };
  const out = over(x, found);
  if (Array.isArray(out.items)) out.items = out.items.map((it: object, i) => over(it, found.flatMap((t) => (Array.isArray(t.items) && t.items[i]) || [])));
  return out as T;
}

/** Pages readers never reach: the hidden ones, and every page under one, wherever it sits. */
export function hiddenSlugs(pages: { slug: string; parent?: string | null; hidden: boolean }[]): Set<string> {
  const bySlug = new Map(pages.map((p) => [p.slug, p]));
  const hidden = (p: (typeof pages)[number] | undefined, seen: Set<string>): boolean =>
    !!p && !seen.has(p.slug) && (p.hidden || hidden(bySlug.get(p.parent ?? ""), seen.add(p.slug)));
  return new Set(pages.filter((p) => hidden(p, new Set())).map((p) => p.slug));
}

const newId = () => `s${Math.random().toString(36).slice(2, 10)}`;

/** A parsed section with its template's defaults filled in, and an id. New fields are copied only when set (D5). */
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
    ...Object.fromEntries(OPTIONAL.filter((k) => s[k] !== undefined).map((k) => [k, s[k]])),
  };
}

/** A zod error as the lines an agent can act on: `sections[2].props.limit: Too big`, one per misspelled key. */
export function issues(err: z.ZodError, prefix = ""): string[] {
  return err.issues.flatMap((i) => {
    const path = i.path.reduce<string>((p, k) => (typeof k === "number" ? `${p}[${k}]` : p ? `${p}.${String(k)}` : String(k)), prefix);
    if (i.code === "unrecognized_keys") return i.keys.map((k) => `${path ? `${path}.` : ""}${k}: Unrecognized key`);
    return [`${path || "input"}: ${i.message}`];
  });
}

/** One section parsed, normalized and checked, its problems pushed onto `errors` under `at`. */
function parseOne(raw: unknown, at: string, taken: Set<string>, errors: string[]): Section | undefined {
  const got = SectionInput.safeParse(raw);
  if (!got.success) {
    errors.push(...issues(got.error, at));
    return undefined;
  }
  const s = normalize(got.data, taken);
  const bad = checkSection(s, at);
  errors.push(...bad);
  return bad.length ? undefined : s;
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
    const made = parseOne(s, `${prefix}[${i}]`, taken, errors);
    if (made) sections.push(made);
  });
  return { sections, errors };
}

/** "a Cards", "an Embed": a template's name as a message says it. */
const an = (name: string) => `${/^[aeiou]/i.test(name) ? "an" : "a"} ${name}`;

/** What zod can't state about a section: grounds that need their parameter, and items only where the template lists them. */
export function checkSection(s: Section, at: string): string[] {
  const info = TEMPLATE_INFO[s.template];
  const bg = s.background ?? {};
  const errors: string[] = [];
  if (s.tone === "color" && !bg.color) errors.push(`${at}.background.color: tone color needs the color rule it is set on`);
  if (s.tone !== "color" && bg.color) errors.push(`${at}.background.color: only for tone color`);
  if (s.tone === "image" && !bg.image) errors.push(`${at}.background.image: tone image needs a picture`);
  if (s.tone !== "image" && (bg.image || bg.scrim !== undefined)) errors.push(`${at}.background.${bg.image ? "image" : "scrim"}: only for tone image`);
  if (s.contexts && !info.accepts) errors.push(`${at}.contexts: ${an(info.name)} section binds no rules, so it has no contexts to show`);
  if (s.items?.length && !info.items) errors.push(`${at}.items: ${an(info.name)} section takes no items`);
  else if (s.items?.length && s.template === "diagram" && s.props.kind !== "cobrand") errors.push(`${at}.items: only a cobrand diagram takes items, its partner`);
  else {
    s.items?.forEach((it, k) => {
      // A logos item is a pair never to use, so a don't is all it can be.
      if (it.verdict && s.template !== "dodont" && !(s.template === "logos" && it.verdict === "dont"))
        errors.push(`${at}.items[${k}].verdict: ${s.template === "logos" ? "a logos item marks a pair never to use: dont" : "only do/don't and logos items take a verdict"}`);
      if (it.span !== undefined && s.template !== "gallery") errors.push(`${at}.items[${k}].span: only gallery items span`);
      if (it.at && s.template !== "annotated") errors.push(`${at}.items[${k}].at: only annotated items sit at a point`);
      if (it.level !== undefined && s.template !== "cards") errors.push(`${at}.items[${k}].level: only cards items have a level`);
      for (const group of info.needs ?? []) {
        if (!group.some((f) => it[f] !== undefined)) errors.push(`${at}.items[${k}]: ${an(info.name)} item needs ${group.join(" or ")}`);
      }
      if (s.template === "pages" && it.link && !it.link.startsWith("/")) errors.push(`${at}.items[${k}].link: a page of this brand, as /slug`);
    });
  }
  if (s.items?.length && s.props.from) errors.push(`${at}.props.from: items pick the pages, from shows a page's children; one or the other`);
  if (s.template === "updates" && (s.props.limit as number) > 20) errors.push(`${at}.props.limit: an updates section lists 20 publishes at most`);
  if (s.template === "embed" && !s.props.url) errors.push(`${at}.props.url: an embed needs the address it shows`);
  if (s.props.ask && !s.contexts) errors.push(`${at}.props.ask: the chooser picks among the section's contexts; give it contexts`);
  if (s.template === "copy") {
    const fields = ((s.props.form ?? []) as { name: string }[]).map((f) => f.name);
    const slots = new Set([...String(s.props.template ?? "").matchAll(SLOT)].map((m) => m[1]));
    for (const name of slots) if (!fields.includes(name)) errors.push(`${at}.props.template: {${name}} is not one of props.form's names`);
  }
  return errors;
}

// ---- what sections point at -------------------------------------------------

/** Every key a section binds, with where: its keys, its items' keys, its background color. */
function bindings(s: Section): { key: string; at: string }[] {
  return [
    ...s.keys.map((key, j) => ({ key, at: `keys[${j}]` })),
    ...(s.items ?? []).flatMap((it, k) => (it.key ? [{ key: it.key, at: `items[${k}].key` }] : [])),
    ...(s.background?.color ? [{ key: s.background.color, at: "background.color" }] : []),
  ];
}

/** The keys a section binds: keys, then items' keys, then the background color; each once, in order. */
export const boundKeys = (s: Section): string[] => [...new Set(bindings(s).map((b) => b.key))];

/** A rule's key changed: sections show it under its new name, in all three places. Null when no section bound it. */
export function renameKey(sections: Section[], from: string, to: string): Section[] | null {
  if (!sections.some((s) => boundKeys(s).includes(from))) return null;
  return sections.map((s) => {
    if (!boundKeys(s).includes(from)) return s;
    return {
      ...s,
      // A key the page kept after its rule went could already be `to`; a section binds each key once.
      keys: [...new Set(s.keys.map((k) => (k === from ? to : k)))],
      ...(s.items && { items: s.items.map((it) => (it.key === from ? { ...it, key: to } : it)) }),
      ...(s.background?.color === from && { background: { ...s.background, color: to } }),
    };
  });
}

/** Every asset a page names, with where: its cover, props images, videos and pattern tiles, backgrounds, items. */
export function assetRefs(page: { cover?: string | null; sections: Section[] }): { id: string; at: string }[] {
  const out = page.cover ? [{ id: page.cover, at: "cover" }] : [];
  page.sections.forEach((s, i) => {
    const at = `sections[${i}]`;
    for (const k of ["image", "video", "asset"]) if (typeof s.props[k] === "string") out.push({ id: s.props[k], at: `${at}.props.${k}` });
    if (s.background?.image) out.push({ id: s.background.image, at: `${at}.background.image` });
    s.items?.forEach((it, k) => it.asset && out.push({ id: it.asset, at: `${at}.items[${k}].asset` }));
  });
  return out;
}

/** Link targets in Markdown: inline links and reference definitions. ponytail: a link inside a code span counts too. */
const MD_LINK = /\]\(\s*<?([^\s)>]+)|^ {0,3}\[[^\]]+\]:\s*<?([^\s>]+)/gm;

/** Where a site link goes; null for an outside link. `#id` is a section of `here`. */
function target(href: string, here: string) {
  const m = SITE_PATH.exec(href);
  return m && (m[1] || m[2]) ? { slug: m[1] ?? here, ...(m[2] && { section: m[2] }) } : null;
}

/** The brand's own pages and sections a page links to, from bodies, asides, items and a pages section's `from`. */
export function siteLinks(page: { slug: string; sections: Section[] }): { at: string; slug: string; section?: string }[] {
  const out: { at: string; slug: string; section?: string }[] = [];
  const scan = (md: string | undefined, at: string) => {
    for (const m of (md ?? "").matchAll(MD_LINK)) {
      const t = target(m[1] ?? m[2], page.slug);
      if (t) out.push({ at, ...t });
    }
  };
  page.sections.forEach((s, i) => {
    scan(s.body, `sections[${i}].body`);
    scan(s.aside, `sections[${i}].aside`);
    s.items?.forEach((it, k) => {
      scan(it.text, `sections[${i}].items[${k}].text`);
      const t = it.link && target(it.link, page.slug);
      if (t) out.push({ at: `sections[${i}].items[${k}].link`, ...t });
    });
    if (typeof s.props.from === "string") out.push({ at: `sections[${i}].props.from`, slug: s.props.from });
  });
  return out;
}

const TYPE_WORD: Record<RuleType, string> = { color: "a color", text: "text", number: "a number", list: "a list", font: "a font" };

/**
 * Whether each section's bound keys name rules it can show. `known`: keys a
 * page already bound, kept even if their rule has gone since (the page says
 * so on reading), so re-saving a page never fails on a key its writer didn't add.
 */
export function checkBindings(sections: Section[], rules: Bindable[], known = new Set<string>(), prefix = "sections"): string[] {
  const byKey = new Map(rules.map((r) => [r.key, r]));
  const errors: string[] = [];
  sections.forEach((s, i) => {
    const info = TEMPLATE_INFO[s.template];
    if (!info.accepts && s.keys.length) errors.push(`${prefix}[${i}].keys: ${an(info.name)} section binds no rules`);
    for (const { key: k, at } of bindings(s)) {
      const r = byKey.get(k);
      if (!r) {
        if (!known.has(k)) {
          const near = [...byKey.keys()].filter((x) => section(x) === section(k));
          errors.push(`${prefix}[${i}].${at}: no rule "${k}"${near.length ? `; this brand has ${near.slice(0, 12).join(", ")}` : ""}`);
        }
      } else if (at === "background.color" || (s.template === "logos" && at.startsWith("items["))) {
        const what = at === "background.color" ? "a background" : "a logos item's key";
        if (r.type !== "color") errors.push(`${prefix}[${i}].${at}: ${what} is a color rule; ${k} is ${TYPE_WORD[r.type]}`);
      } else if (at.startsWith("keys[") && info.accepts && !info.accepts(r)) {
        errors.push(
          `${prefix}[${i}].${at}: ${an(info.name)} section shows ${info.binds}; ${k} is ${TYPE_WORD[r.type]}${info.binds?.includes("assets") && !hasAssets(r) ? " with no assets" : ""}`,
        );
      }
    }
  });
  return errors;
}

/** Whether the pages make a tree: every parent a page, no loops, three levels at most. */
export function checkTree(pages: { slug: string; parent?: string | null }[]): string[] {
  const parentOf = new Map(pages.map((p) => [p.slug, p.parent ?? null]));
  const errors: string[] = [];
  const looped = new Set<string>();
  for (const p of pages) {
    if (p.parent != null && !parentOf.has(p.parent)) {
      errors.push(`page "${p.slug}": its parent "${p.parent}" is not a page`);
      continue;
    }
    const chain = [p.slug];
    let up = p.parent ?? null;
    while (up !== null && parentOf.has(up) && !chain.includes(up)) {
      chain.push(up);
      up = parentOf.get(up) ?? null;
    }
    if (up === p.slug) {
      if (!looped.has(p.slug)) errors.push(`page "${p.slug}": a loop, ${[...chain, p.slug].join(" > ")}`);
      chain.forEach((s) => looped.add(s));
    } else if (up === null && chain.length > 3) {
      errors.push(`page "${p.slug}": ${chain.length} levels deep; three at most`);
    }
  }
  return errors;
}

/**
 * Apply edit_page's ops to a page's sections, in order: add, update, move,
 * remove, and `page` ops folded into one patch of the page's own fields.
 * Every problem comes back with its op's path; the caller writes nothing
 * unless `errors` is empty.
 */
export function applyOps(stored: Section[], ops: PageOp[], slug: string): { sections: Section[]; page: PagePatch; errors: string[] } {
  const sections = [...stored];
  const taken = new Set(sections.map((s) => s.id));
  const errors: string[] = [];
  let page: PagePatch = {};
  const at = (id: string, i: number) => {
    const n = sections.findIndex((s) => s.id === id);
    if (n < 0) errors.push(`ops[${i}]: no section "${id}" on ${slug}; its sections are ${sections.map((s) => s.id).join(", ") || "none"}`);
    return n;
  };
  /** Where "after" puts a section: null the top, undefined the end. */
  const slot = (after: string | null | undefined, i: number) => Math.max(after === null ? 0 : after === undefined ? sections.length : at(after, i) + 1, 0);
  for (const [i, op] of ops.entries()) {
    if (op.op === "add") {
      if (op.section.id && taken.has(op.section.id)) {
        errors.push(`ops[${i}].section.id: "${op.section.id}" is taken on ${slug}`);
        continue;
      }
      const made = parseOne(op.section, `ops[${i}].section`, taken, errors);
      if (made) sections.splice(slot(op.after, i), 0, made);
    } else if (op.op === "update") {
      const n = at(op.id, i);
      if (n < 0) continue;
      const set = Object.fromEntries(Object.entries({ ...sections[n], ...op.set, id: op.id }).filter(([, v]) => v !== null));
      const made = parseOne(set, `ops[${i}].set`, taken, errors);
      if (made) sections[n] = made;
    } else if (op.op === "move") {
      const n = at(op.id, i);
      if (n < 0) continue;
      const [s] = sections.splice(n, 1);
      sections.splice(slot(op.after, i), 0, s);
    } else if (op.op === "remove") {
      const n = at(op.id, i);
      if (n >= 0) sections.splice(n, 1);
    } else {
      page = { ...page, ...op.set };
    }
  }
  if (sections.length > MAX_SECTIONS) errors.push(`ops: that makes ${sections.length} sections; a page holds ${MAX_SECTIONS} at most`);
  return { sections, page, errors };
}

type Linked = { slug: string; sections: Section[]; hidden?: boolean; aliases?: string[] | null };
type Warned = Pick<Rule, "key"> & Partial<Pick<Rule, "type" | "context" | "spec" | "assets">>;

/** Lengths a reader compares; x, %, em and ms are of something else, so they mix with anything. */
const LENGTHS = ["px", "pt", "mm", "cm", "in"];
const unitOf = (r: Warned) => (r.type === "number" && r.spec && "unit" in r.spec ? r.spec.unit : undefined);

/** The number rule a diagram measures by, beside its mark. */
const DIAGRAM_NEEDS: Partial<Record<(typeof DIAGRAMS)[number], string>> = {
  clearspace: "a number rule, its clear space in x",
  minsize: "a number rule, its minimum size in px or mm",
};

/** A section's warnings that are about what it draws rather than its links: units that mix, a diagram or an annotated image with nothing to draw on. */
function ruleWarnings(s: Section, at: string, rules: Warned[]): string[] {
  const out: string[] = [];
  const keys = new Set(boundKeys(s));
  const bound = rules.filter((r) => keys.has(r.key));
  // A context shows its own versions and the defaults of the rest: those are the units read side by side.
  for (const ctx of new Set(bound.map((r) => r.context ?? ""))) {
    const shown = resolve(bound.map((r) => ({ ...r, context: r.context ?? null })), ctx).filter((r) => LENGTHS.includes(unitOf(r) ?? ""));
    const units = [...new Set(shown.map(unitOf))];
    if (units.length > 1) out.push(`${at}: mixes ${units.join(" and ")}${ctx ? ` in ${ctx}` : ""} (${shown.map((r) => `${r.key} in ${unitOf(r)}`).join(", ")}); give them one unit`);
  }
  if (s.template === "diagram") {
    const kind = (s.props.kind as (typeof DIAGRAMS)[number] | undefined) ?? "clearspace";
    if (!bound.some((r) => r.assets?.length)) out.push(`${at}.keys: a ${kind} diagram draws a mark; bind a rule with its picture`);
    if (DIAGRAM_NEEDS[kind] && !bound.some((r) => r.type === "number")) out.push(`${at}.keys: a ${kind} diagram draws from ${DIAGRAM_NEEDS[kind]}; bind one`);
    if (kind === "cobrand" && !s.items?.length && !s.props.partner) out.push(`${at}: a cobrand diagram needs its partner: an item with their mark, or props.partner`);
  }
  // Saved without it, so a starter section can be added before its picture is picked.
  if (s.template === "annotated" && !s.props.image) out.push(`${at}.props.image: an annotated image draws its hotspots on a picture; pick one`);
  return out;
}

/**
 * What a reader would trip on, though the page saves: links to a page or
 * section that isn't there or is hidden, bound keys with no rule, lengths in
 * two units side by side, and a diagram missing what it draws from.
 */
export function pageWarnings(page: Linked, pages: Linked[], rules: Warned[]): string[] {
  const all = [page, ...pages.filter((p) => p.slug !== page.slug)];
  const find = (slug: string) => all.find((p) => p.slug === slug) ?? all.find((p) => p.aliases?.includes(slug));
  const out: string[] = [];
  for (const l of siteLinks(page)) {
    const href = `/${l.slug}${l.section ? `#${l.section}` : ""}`;
    const to = find(l.slug);
    const s = l.section === undefined ? undefined : to?.sections.find((x) => x.id === l.section);
    if (!to) out.push(`${l.at}: links to ${href}, but there is no page "${l.slug}"`);
    else if (to !== page && to.hidden) out.push(`${l.at}: links to ${href}, which is hidden`);
    else if (l.section !== undefined && !s) out.push(`${l.at}: links to ${href}, but ${to.slug} has no section "${l.section}"`);
    else if (s?.hidden) out.push(`${l.at}: links to ${href}, a hidden section`);
  }
  const keys = new Set(rules.map((r) => r.key));
  page.sections.forEach((s, i) => {
    for (const b of bindings(s)) if (!keys.has(b.key)) out.push(`sections[${i}].${b.at}: no rule "${b.key}"; readers see nothing for it`);
    out.push(...ruleWarnings(s, `sections[${i}]`, rules));
  });
  for (const d of designWarnings(page.sections)) out.push(`${d.at === null ? "page" : `sections[${d.at}]`}: ${d.text}`);
  return out;
}

/** Grounds that read as a block of their own: two in a row run together. */
const BLOCKS: Tone[] = ["tint", "panel", "dark", "brand", "pattern", "color"];

/**
 * Where a page reads but doesn't look designed: nothing on it, two grounds
 * of a kind in a row, more than one cover, a long title typed in capitals,
 * starter text left in. `at` is the section's index, null for the page. The
 * builder lists them as checks; agents get them with a save's warnings.
 */
export function designWarnings(sections: Section[]): { at: number | null; text: string }[] {
  const out: { at: number | null; text: string }[] = [];
  const shown = sections.flatMap((s, at) => (s.hidden ? [] : [{ s, at }]));
  if (!shown.length) return [{ at: null, text: "nothing shows on this page; readers see only its title" }];
  const covers = shown.filter(({ s }) => s.template === "cover");
  if (covers.length > 1) out.push({ at: covers[1].at, text: "a second cover; a page opens once, so open its parts with a header section" });
  shown.forEach(({ s, at }, n) => {
    const prev = shown[n - 1]?.s;
    const same = prev && s.tone === prev.tone && (s.tone !== "color" || s.background?.color === prev.background?.color);
    if (same && BLOCKS.includes(s.tone) && !s.tab && !prev.tab) out.push({ at, text: `a second ${s.tone} ground in a row runs into the one before; make one of them plain` });
    const title = s.title ?? "";
    if (title.length > 24 && /\p{Lu}/u.test(title) && title === title.toUpperCase())
      out.push({ at, text: "the title is typed in capitals, which read slowly at length; type it as a sentence" });
    // A starter's body is one italic prompt (page-sets.ts): still there, it was never written over.
    if (/^_[^_]+_$/.test(s.body ?? "") || /lorem ipsum/i.test(`${title} ${s.body ?? ""}`)) out.push({ at, text: "still has its starter text" });
  });
  return out;
}

/** Query params a page never passes on: readers see approved, deliverable assets only, and the section sets its own limit. */
const DROPPED = ["status", "review", "proposedBy", "limit", "offset"];

/** Templates that list assets live from the library, as the server finds them (core/section-assets.ts). */
export const isLive = (t: Template) => t === "collection" || t === "icons";

/**
 * What a live section asks the library for. An icon set with no source of its
 * own lists what is tagged icon (what an icon pack import tags), by name.
 */
export function liveProps(s: Pick<Section, "template" | "props">): z.output<(typeof TEMPLATE_PROPS)["collection"]> {
  const p = s.props as z.output<(typeof TEMPLATE_PROPS)["collection"]>;
  if (s.template !== "icons") return p;
  const own = p.collection || p.search || p.query;
  return { ...p, sort: p.sort ?? "name", limit: p.limit ?? 96, query: own ? p.query : "tag=icon" };
}

/**
 * The library query a collection section runs: its saved search's query,
 * narrowed by `props.query`. Words in `q` join (every word must match), `tag`
 * and `f.*` add to the saved ones, anything else in `props.query` replaces the
 * saved value. `props.collection` replaces any collection the queries name.
 */
export function collectionQuery(saved: string | null, props: { collection?: string; query?: string }): URLSearchParams {
  const out = new URLSearchParams((saved ?? "").replace(/^\?/, ""));
  const own = new URLSearchParams((props.query ?? "").replace(/^\?/, ""));
  for (const k of new Set(own.keys())) {
    const values = own.getAll(k);
    if (k === "q") out.set("q", [out.get("q"), ...values].filter(Boolean).join(" "));
    else {
      if (k !== "tag" && !k.startsWith("f.")) out.delete(k);
      for (const v of values) out.append(k, v);
    }
  }
  for (const k of DROPPED) out.delete(k);
  if (props.collection) out.set("collection", props.collection);
  return out;
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

/** Pages without their updatedAt, which a comparison leaves out: the time of a change is not a change. */
const untimed = (ps: SnapPage[] | null) => (ps ?? []).map((p) => ({ ...p, updatedAt: undefined }));

export const samePages = (a: SnapPage[] | null, b: SnapPage[] | null) => canon(untimed(a)) === canon(untimed(b));

/** Which pages differ between two snapshots, by slug, for a version's summary: "page:logo". */
export function changedPages(before: SnapPage[] | null, after: SnapPage[]): string[] {
  const was = new Map(untimed(before).map((p) => [p.slug, canon(p)]));
  const now = new Map(untimed(after).map((p) => [p.slug, canon(p)]));
  return [...new Set([...was.keys(), ...now.keys()])].filter((s) => was.get(s) !== now.get(s)).map((s) => `page:${s}`);
}

// ---- a first layout ---------------------------------------------------------

const PAGE_TITLES: Record<string, string> = { color: "Color", logo: "Logo", type: "Typography", tone: "Voice and tone", imagery: "Imagery" };
const titleOf = (s: string) => PAGE_TITLES[s] ?? s[0].toUpperCase() + s.slice(1).replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();

type Draft = { slug: string; title: string; sections: SectionInput[] };

/** The page initialPages makes for a section of keys (typeScale: type-scale), which v1's #section- links still name. */
export const slugOfSection = (name: string) => {
  const slug = name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  return slug === "overview" ? "overview-2" : slug;
};

/**
 * Pages laid out from a brand's rules, for a brand that has none: an Overview
 * (cover, palette and contents), then a page per section of keys with the
 * templates its rules fit. Every rule lands somewhere; what fits no template
 * goes in a Text section. The same split the builder prototype showed.
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
    pages.push({ slug: slugOfSection(s), title: titleOf(s), sections });
  }
  // The pages are side by side, not under the Overview, so its contents pick them.
  const rest = pages.slice(1, 1 + MAX_ITEMS).map((p) => ({ link: `/${p.slug}` }));
  if (rest.length) pages[0].sections.push({ template: "pages", title: "Contents", items: rest });
  return pages;
}

// ---- for agents -------------------------------------------------------------

/**
 * What list_templates and GET /api/v1/brand/templates serve: each template
 * with its props as JSON Schema and an example, and what every section takes,
 * from the schema's own descriptions so the two never drift.
 */
export function templateCatalog() {
  return {
    templates: TEMPLATES.map((t) => {
      const { name, use, binds, items, width, columns, tone, example } = TEMPLATE_INFO[t];
      const props = z.toJSONSchema(TEMPLATE_PROPS[t], { io: "input" }) as Record<string, unknown>;
      delete props.$schema;
      return { template: t, name, use, binds, items, defaults: { width, columns, tone }, props, example };
    }),
    common: `Every section also takes: ${Object.entries(base)
      .map(([k, s]) => (s.description ? `${k} (${s.description})` : k))
      .join("; ")}.`,
  };
}

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

function itemLine(it: Item) {
  const words = [it.title && `**${it.title}**`, (it.text ?? it.caption)?.replace(/\s+/g, " "), it.link && `(${it.link})`].filter(Boolean).join(" ");
  return `- ${it.verdict ? `${it.verdict === "do" ? "Do" : "Don't"}: ` : ""}${words}`.trimEnd();
}

type MarkdownPage = Pick<SnapPage, "title" | "sections"> & {
  eyebrow?: string | null;
  lede?: string | null;
  audience?: Audience | null;
  layout?: PageLayout | null;
};

/** What a template with a `kind` draws when it is left out. */
const DRAWN: Partial<Record<Template, string>> = { diagram: "clearspace", specimen: "spacing", chart: "bar" };

/** A page as Markdown: what it says and shows, for an agent to read or check its work against. */
export function pageMarkdown(page: MarkdownPage, rules: Readable[]): string {
  const byKey = new Map(rules.map((r) => [r.key, r]));
  const out = [`# ${page.title}`];
  const flags = [page.audience && page.audience !== "everyone" && `audience=${page.audience}`, page.layout === "landing" && "layout=landing"].filter(Boolean);
  if (flags.length) out.push(`<!-- ${flags.join(" ")} -->`);
  if (page.eyebrow) out.push("", `_${page.eyebrow}_`);
  if (page.lede) out.push("", page.lede);
  for (const s of page.sections) {
    if (s.hidden) continue;
    const info = TEMPLATE_INFO[s.template];
    const flags = [
      s.tone !== info.tone && `tone=${s.tone}`,
      s.audience && s.audience !== "everyone" && `audience=${s.audience}`,
      s.tab && `tab=${JSON.stringify(s.tab)}`,
      s.contexts && `contexts=${s.contexts.join(",")}`,
      s.only && `only=${s.only}`,
    ].filter(Boolean);
    out.push("", `## ${s.title || info.name}`, `<!-- ${[s.template, s.id, ...flags].join(" ")} -->`);
    if (s.eyebrow) out.push("", `_${s.eyebrow}_`);
    if (s.lede) out.push("", s.lede);
    if (s.body) out.push("", s.body);
    const lines = s.keys.map((k) => (byKey.has(k) ? ruleLine(byKey.get(k)!) : `- \`${k}\`: (no such rule)`));
    if (lines.length) out.push("", ...lines);
    if (s.template === "logos" && s.items?.length) out.push("", ...s.items.map((it) => `- Don't: asset ${it.asset} on \`${it.key}\`${it.caption ? `. ${it.caption}` : ""}`));
    else if (s.items?.length) out.push("", ...s.items.map(itemLine));
    const drawn = DRAWN[s.template];
    if (drawn) {
      const p = s.props as { kind?: string; positions?: string[]; partner?: string };
      out.push("", `Drawn: ${p.kind ?? drawn}${p.positions?.length ? `, at ${p.positions.join(", ")}` : ""}${p.partner ? `, beside ${p.partner}` : ""}.`);
    }
    if (s.template === "copy" && s.props.template) out.push("", `Generated from a form: ${s.props.template}`);
    if (s.template === "embed") out.push("", `${framed(String(s.props.url)) ? "Embedded" : "A link"}: ${s.props.url}`);
    if (s.template === "request") out.push("", `Readers ask here (${(s.props.kind as string | undefined) ?? "question"})${s.props.prompt ? `: ${s.props.prompt}` : "."}`);
    if (s.aside) out.push("", s.aside.split("\n").map((l) => `> ${l}`.trimEnd()).join("\n"));
    if (s.template === "pages" && !s.items?.length) out.push("", `The pages under ${typeof s.props.from === "string" ? `/${s.props.from}` : "this one"}.`);
    if (isLive(s.template)) {
      const p = liveProps(s);
      const from = p.collection ? `collection ${p.collection}` : p.search ? `saved search ${p.search}` : "the library";
      out.push("", `${s.template === "icons" ? "Icons" : "Assets"} from ${from}${p.query ? `, filtered by ${p.query}` : ""}.`);
    }
    if (s.template === "updates") out.push("", `The latest ${(s.props.limit as number | undefined) ?? 5} publishes.`);
  }
  return out.join("\n");
}
