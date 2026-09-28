import type { z } from "zod";
import { brandTheme, type ThemeSettings } from "../brand-theme.ts";
import { assetRefs, type PageInput, parseSections } from "../pages.ts";
import { RuleInput } from "../rules.ts";
import type { Media, NavPage, PageView, ViewAsset, ViewRule } from "../site.ts";

/**
 * Brand books to build from, written as an agent would send them: rules for
 * set_rules, pages for save_page, settings for set_theme. scripts/mcp-eval.ts
 * builds them over MCP; theme tests read them as data; and fixtureView makes
 * a page of one into the view the renderers draw, for /design/pages.
 *
 * Pure: `pnpm test` runs it under plain Node, and the dev page loads it as is.
 */

export type BrandBook = {
  rules: z.input<typeof RuleInput>[];
  /** In an order save_page takes one at a time: a page's parent before it. */
  pages: ({ slug: string } & z.input<typeof PageInput>)[];
  theme: ThemeSettings;
};

/** The pictures a book shows, by asset id. Placeholders until the eval ingests the real logos. */
export type BookAssets = { mark: string; wordmark: string };
const PLACEHOLDERS: BookAssets = {
  mark: "00000000-0000-4000-8000-000000000001",
  wordmark: "00000000-0000-4000-8000-000000000002",
};

/**
 * Blender: the seed's rules (scripts/seed-demo.ts) with labels, specs, an ink
 * and a gradient, and six pages that use every template, items, tones, tabs
 * and a tree (logo-use sits under logo). Every page links and binds only what
 * is there, so get_page answers it with no missing keys and no warnings. The
 * eval edits the logo page and counts its sections, so new sections go elsewhere.
 */
export function blender(a: BookAssets = PLACEHOLDERS): BrandBook {
  return {
    rules: [
      {
        key: "brand.mission",
        label: "Mission",
        type: "text",
        value: "Blender is the free and open source 3D creation suite. **The freedom to create.**",
        usage: "The one line that says what Blender is. Lead with it in intros and about pages.",
      },
      {
        key: "color.primary",
        label: "Blender orange",
        type: "color",
        value: "#e87d0d",
        usage: "Blender orange (PMS 716). The logo's circle and the brand's accent: links, highlights, calls to action.",
        spec: { token: "Orange", group: "Primary", weight: 40, pair: "color.background", pantone: ["716 C"], cmyk: [0, 60, 100, 0], print: "converted" },
      },
      {
        key: "color.secondary",
        label: "Blender blue",
        type: "color",
        value: "#265787",
        usage: "Blender blue (PMS 647). The logo's inner dot and headings on light backgrounds.",
        spec: { token: "Blue", group: "Primary", weight: 25, pair: "color.background", pantone: ["647 C"] },
      },
      {
        key: "color.background",
        label: "White",
        type: "color",
        value: "#ffffff",
        usage: "White. The logo's third color and the default page background.",
        spec: { group: "Neutrals", weight: 25, pair: "color.ink" },
      },
      {
        key: "color.background",
        context: "dark-background",
        type: "color",
        value: "#1d1d1d",
        usage: "Near black, as in the Blender interface. Keep the logo in its original colors on it.",
      },
      {
        key: "color.ink",
        label: "Ink",
        type: "color",
        value: "#1d1d1d",
        usage: "Text on white, and the dark ground: the Blender interface's near black.",
        spec: { group: "Neutrals", weight: 10, pair: "color.background" },
      },
      {
        key: "color.blend",
        label: "Orange to blue",
        type: "color",
        value: "#e87d0d",
        usage: "Covers and title cards only. Where a gradient can't go, its solid is Blender orange.",
        spec: { group: "Primary", gradient: { kind: "linear", angle: 135, stops: [{ color: "color.primary" }, { color: "color.secondary", at: 100 }] } },
      },
      {
        key: "type.primary",
        label: "Text",
        type: "font",
        value: { family: "Inter", weight: 400 },
        usage: "The Blender interface face since 4.0. Available on Google Fonts.",
        spec: {
          role: "body",
          lineHeight: 1.5,
          source: "google",
          url: "https://fonts.google.com/specimen/Inter",
          license: "SIL Open Font License 1.1",
          fallback: "system-ui, sans-serif",
        },
      },
      {
        key: "type.heading",
        label: "Headings",
        type: "font",
        value: { family: "Inter", size: 32, weight: 700 },
        usage: "Headings. One weight step up is enough; no italics.",
        spec: { role: "headline", lineHeight: 1.2, tracking: -0.01, source: "google" },
      },
      { key: "type.scale", label: "Type scale", type: "list", value: [12, 14, 16, 20, 24, 32, 48], usage: "Pixels. Pick from the scale, nothing between steps." },
      {
        key: "logo.mark",
        label: "The mark",
        type: "text",
        value: "The Blender mark: the orange circle and blue dot, no text.",
        usage: "App icons, avatars, favicons and anywhere the name is already on screen.",
        assets: [a.mark],
      },
      {
        key: "logo.wordmark",
        label: "The logo",
        type: "text",
        value: "The mark with the Blender wordmark.",
        usage: "The default logo. Use it when pointing to Blender or giving credit, linked to blender.org.",
        assets: [a.wordmark],
      },
      { key: "logo.minSize", label: "Minimum size", type: "number", value: 24, usage: "The mark's height on screen, at the least.", spec: { unit: "px" } },
      {
        key: "logo.clearSpace",
        label: "Clear space",
        type: "number",
        value: 0.5,
        usage: "Room on every side, kept free of text and other marks.",
        spec: { unit: "x", of: "the mark's height" },
      },
      {
        key: "logo.always",
        label: "Always",
        type: "list",
        value: ["Use it only to point to Blender or to give credit", "Link it to blender.org on the web", "Keep its original colors and typography", "Pair it with text or other logos in credits"],
      },
      {
        key: "logo.neverDo",
        label: "Never",
        type: "list",
        value: ["Use it as your own logo", "Modify or enhance it", "Show it alone in credits", "Put it on commercial products without permission"],
      },
      { key: "tone.always", label: "We say", type: "list", value: ["Plain words", "Credit the community", "Say free and open source"] },
      { key: "tone.avoid", label: "We avoid", type: "list", value: ["Hype", "Exclamation marks", "Em dashes"] },
    ],

    pages: [
      {
        slug: "overview",
        title: "Overview",
        eyebrow: "Brand guidelines",
        lede: "How Blender looks, sounds and is used.",
        icon: "bookmark",
        sections: [
          { id: "cover", template: "cover", eyebrow: "Brand guidelines", title: "Blender", lede: "The freedom to create." },
          {
            id: "mission",
            template: "text",
            title: "What Blender is",
            keys: ["brand.mission"],
            aside: "New here? Start with [the logo](/logo), then [how to use it](/logo-use#misuse).",
          },
          { id: "glance", template: "palette", title: "At a glance", keys: ["color.primary", "color.secondary", "color.background"], tone: "tint" },
          {
            id: "in-use",
            template: "gallery",
            title: "In use",
            body: "The logo as it appears in credits and on screens.",
            items: [
              { asset: a.wordmark, title: "Credits", caption: "The logo, linked to blender.org." },
              { asset: a.mark, title: "App icon", caption: "The mark alone, where the name is already on screen.", download: false },
            ],
          },
          { id: "library", template: "collection", title: "From the library", props: { query: "type=image", limit: 12 } },
          {
            id: "contents",
            template: "pages",
            title: "Contents",
            items: [{ link: "/logo" }, { link: "/color" }, { link: "/typography" }, { link: "/voice" }],
          },
          { id: "more", template: "pages", title: "More on the logo", props: { from: "logo", layout: "list", depth: 2 } },
        ],
      },
      {
        slug: "logo",
        title: "Logo",
        lede: "One mark and one logo, to point to Blender or to give credit.",
        icon: "flag",
        cover: a.wordmark,
        tabs: true,
        sections: [
          { id: "mark", template: "split", title: "The mark", body: "An orange circle holding a blue dot.", keys: ["logo.mark"] },
          { id: "versions", template: "logos", title: "Versions", keys: ["logo.mark", "logo.wordmark"], tone: "panel" },
          { id: "size", template: "text", title: "Size and space", body: "Give it room, and never set it smaller than it reads.", keys: ["logo.minSize", "logo.clearSpace"] },
        ],
      },
      {
        slug: "logo-use",
        parent: "logo",
        title: "Using the logo",
        lede: "It points to Blender; it never stands for you.",
        sections: [
          {
            id: "misuse",
            template: "dodont",
            title: "Do and don't",
            keys: ["logo.always", "logo.neverDo"],
            tone: "tint",
            items: [
              { verdict: "do", title: "Link it", text: "On the web, link it to [blender.org](https://www.blender.org).", asset: a.wordmark },
              { verdict: "dont", title: "Recolor it", text: "Keep its orange, blue and white. Never tint or outline it.", asset: a.mark },
            ],
          },
          {
            id: "credits",
            template: "text",
            title: "Giving credit",
            body: "Made with Blender? Say so beside the other tools you used, never with the Blender logo alone.",
            tone: "color",
            background: { color: "color.secondary" },
            audience: "partners",
          },
          {
            id: "downloads",
            template: "links",
            title: "Downloads",
            keys: ["logo.mark", "logo.wordmark"],
            items: [{ title: "The logo on blender.org", text: "The official files and terms.", link: "https://www.blender.org/about/logo/", label: "Web" }],
          },
        ],
      },
      {
        slug: "color",
        title: "Color",
        lede: "Orange and blue on white: the logo's three colors.",
        icon: "palette",
        sections: [
          {
            id: "palette",
            template: "palette",
            title: "Palette",
            keys: ["color.primary", "color.secondary", "color.background", "color.ink"],
            contexts: ["default", "dark-background"],
            tab: "Screen",
          },
          { id: "blend", template: "palette", title: "Gradient", body: "For covers and title cards; everywhere else, its solid.", keys: ["color.blend"], tone: "dark", tab: "Screen" },
          {
            id: "print",
            template: "text",
            title: "Print",
            body: "Blender orange is Pantone 716 C and Blender blue Pantone 647 C. Use CMYK only where spot colors can't go.",
            tab: "Print",
          },
        ],
      },
      {
        slug: "typography",
        title: "Typography",
        lede: "Inter, in two weights.",
        icon: "brush",
        sections: [
          { id: "faces", template: "type", title: "Typefaces", keys: ["type.heading", "type.primary", "type.scale"], props: { sample: "The freedom to create" } },
          {
            id: "setting",
            template: "text",
            title: "Setting text",
            body: "Headings one weight step up from the text, never in italics. Sizes from the scale, nothing between steps.",
            tone: "pattern",
          },
        ],
      },
      {
        slug: "voice",
        title: "Voice",
        lede: "Plain words, and credit where it is due.",
        icon: "speakerphone",
        sections: [
          { id: "habits", template: "dodont", title: "How we write", keys: ["tone.always", "tone.avoid"] },
          {
            id: "line",
            template: "text",
            title: "In one line",
            lede: "Blender is free and open source, made by a community.",
            tone: "dark",
            aside: "The long version is [the mission](/overview#mission).",
          },
          { id: "writing", template: "header", eyebrow: "Part two", title: "Writing", lede: "How Blender sounds, in a few habits." },
          {
            id: "we-say",
            template: "cards",
            title: "What we say",
            keys: ["tone.always"],
            items: [{ title: "Free and open source", text: "Say both, every time.", icon: "heart" }],
          },
        ],
      },
    ],

    theme: {
      accent: "color.primary",
      surface: "color.background",
      ink: "color.ink",
      dark: "color.ink",
      head: "type.heading",
      body: "type.primary",
      logo: "logo.wordmark",
      device: a.mark,
      radius: 6,
      width: "normal",
      density: "normal",
      nav: "sidebar",
      band: true,
      numbering: true,
      motion: "subtle",
    },
  };
}

/**
 * Blender and then some: 60 rules, and a last page of 30 sections (each of
 * Blender's, then palettes and notes of made-up rules). A long page, for
 * profiling the builder (W6).
 */
export function big(a: BookAssets = PLACEHOLDERS): BrandBook {
  const book = blender(a);
  const extra = Array.from({ length: 60 - book.rules.length }, (_, i): BrandBook["rules"][number] =>
    i % 2
      ? { key: `copy.note${i}`, label: `Note ${i}`, type: "text", value: `Note ${i}: a line of guidance, long enough to wrap once on a phone.` }
      : { key: `color.extra${i}`, label: `Extra ${i}`, type: "color", value: `#${(0x1a2b3c + i * 0x0b1f37).toString(16).padStart(6, "0").slice(-6)}` },
  );
  const keys = (prefix: string) => extra.map((r) => r.key).filter((k) => k.startsWith(prefix));
  const chunks = (ks: string[]) => [0, 1, 2, 3].map((j) => ks.filter((_, i) => i % 4 === j));
  const sections = [
    ...book.pages.flatMap((p) => p.sections),
    ...chunks(keys("color.")).map((ks, j) => ({ id: `colors-${j}`, template: "palette" as const, title: `More colors ${j + 1}`, keys: ks })),
    ...chunks(keys("copy.")).map((ks, j) => ({ id: `notes-${j}`, template: "text" as const, title: `More notes ${j + 1}`, keys: ks })),
  ];
  return { ...book, rules: [...book.rules, ...extra], pages: [...book.pages, { slug: "everything", title: "Everything", sections }] };
}

// ---- views --------------------------------------------------------------------

/** Every book by name, for `/design/pages?fixture=`. W3 adds ugly and hairline, W5 rtl. */
export const FIXTURES: Record<string, (a?: BookAssets) => BrandBook> = { blender, big };

/** When a view says the fixtures changed: fixed, so the server and the browser draw the same page. */
const AT = "2026-09-01T00:00:00.000Z";

const svg = (w: number, h: number, body: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`)}`;
const MARK = '<circle cx="48" cy="48" r="40" fill="#e87d0d"/><circle cx="48" cy="48" r="17" fill="#fff"/><circle cx="48" cy="48" r="11" fill="#265787"/>';

/** The placeholder assets drawn as SVG, so the dev page needs no server and no upload. */
const PICTURES: Record<string, { filename: string; title: string; description: string; width: number; height: number; src: string }> = {
  [PLACEHOLDERS.mark]: {
    filename: "blender-mark.svg",
    title: "The mark",
    description: "The orange circle and the blue dot.",
    width: 96,
    height: 96,
    src: svg(96, 96, MARK),
  },
  [PLACEHOLDERS.wordmark]: {
    filename: "blender-logo.svg",
    title: "The logo",
    description: "The mark beside the wordmark.",
    width: 360,
    height: 96,
    src: svg(360, 96, `${MARK}<text x="104" y="64" font-family="sans-serif" font-size="44" font-weight="700" fill="#265787">blender</text>`),
  },
};
/** Any other id: a grey tile, so a fixture naming an asset it doesn't draw still shows something. */
const BLANK = svg(160, 120, '<rect width="160" height="120" fill="#d4d4d8"/>');

/** Where a fixture's asset loads from, whatever rendition was asked: the `url` the dev page hands the site. */
export const fixtureUrl = (id: string) => PICTURES[id]?.src ?? BLANK;

function media(id: string): Media {
  const p = PICTURES[id];
  const src = p?.src ?? BLANK;
  const filename = p?.filename ?? `${id}.svg`;
  return {
    id,
    filename,
    title: p?.title ?? null,
    description: p?.description ?? null,
    creator: null,
    copyright: null,
    mime: "image/svg+xml",
    size: src.length,
    width: p?.width ?? 160,
    height: p?.height ?? 120,
    thumbnail: src,
    preview: src,
    original: src,
    downloads: [{ preset: "original", label: "Original", hint: "The file as uploaded", url: src, filename }],
    focus: null,
    updatedAt: AT,
  };
}

const viewAsset = (id: string): ViewAsset => {
  const m = media(id);
  return { id, rendition: null, title: m.title, filename: m.filename, mime: m.mime, size: m.size, preview: true, width: m.width, height: m.height };
};

/**
 * A page of a book as a reader gets it, made here rather than by the server
 * (lib/page-view.ts): every rule, the pictures above, a collection of them,
 * and nothing locked, as an editor previewing sees it. The first page when
 * `slug` is left out. Throws for a book or a page there isn't.
 */
export function fixtureView(name: string, slug?: string | null): PageView {
  const make = Object.hasOwn(FIXTURES, name) ? FIXTURES[name] : undefined;
  if (!make) throw new Error(`No fixture "${name}"; there are ${Object.keys(FIXTURES).join(", ")}`);
  const book = make();
  const rules = book.rules.map((raw): ViewRule => {
    const r = RuleInput.parse(raw);
    return {
      key: r.key,
      context: r.context ?? null,
      type: r.type,
      label: r.label ?? null,
      value: r.value,
      usage: r.usage ?? null,
      spec: ("spec" in r && r.spec) || null,
      assets: (r.assets ?? []).map((a) => viewAsset(a.id)),
    };
  });
  const pages = book.pages.map(({ slug, sections, title, parent, icon, eyebrow, lede, cover, audience, tabs }, position) => {
    const parsed = parseSections(sections);
    if (parsed.errors.length) throw new Error(`${name}/${slug}: ${parsed.errors.join("; ")}`);
    const home = position === 0 && parsed.sections[0]?.template === "cover";
    const meta: Omit<NavPage, "locked"> = {
      slug,
      title,
      parent: parent ?? null,
      position,
      icon: icon ?? null,
      eyebrow: eyebrow ?? null,
      lede: lede ?? null,
      cover: cover ?? null,
      audience: audience ?? "everyone",
      tabs: tabs ?? false,
      home,
      updatedAt: AT,
    };
    return { meta, sections: parsed.sections };
  });
  const at = slug ? pages.find((p) => p.meta.slug === slug) : pages[0];
  if (!at) throw new Error(`No page "${slug}" in ${name}; there are ${pages.map((p) => p.meta.slug).join(", ")}`);
  const ids = new Set([
    ...Object.keys(PICTURES),
    ...rules.flatMap((r) => r.assets.map((a) => a.id)),
    ...assetRefs({ cover: at.meta.cover, sections: at.sections }).map((r) => r.id),
    ...(book.theme.device ? [book.theme.device] : []),
  ]);
  const shelf = Object.keys(PICTURES).map(media);
  return {
    brand: { slug: name, name: name[0].toUpperCase() + name.slice(1) },
    version: null,
    context: null,
    contexts: [...new Set(rules.flatMap((r) => (r.context ? [r.context] : [])))],
    lang: null,
    theme: { settings: book.theme, v1: brandTheme(rules) },
    nav: pages.map((p) => ({ ...p.meta, locked: false })),
    page: { ...at.meta, sections: at.sections, aliases: [] },
    locked: false,
    rules,
    media: Object.fromEntries([...ids].map((id) => [id, media(id)])),
    collections: Object.fromEntries(
      at.sections.filter((s) => s.template === "collection").map((s) => [s.id, { items: shelf, total: shelf.length, error: null }]),
    ),
    signed: {},
    warnings: [],
    missing: [],
  };
}
