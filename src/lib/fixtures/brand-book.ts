import type { z } from "zod";
import type { ThemeSettings } from "../brand-theme.ts";
import type { PageInput } from "../pages.ts";
import type { RuleInput } from "../rules.ts";

/**
 * Brand books to build from, written as an agent would send them: rules for
 * set_rules, pages for save_page, settings for set_theme. scripts/mcp-eval.ts
 * builds them over MCP; dev pages and theme tests read them as data.
 *
 * Pure data, with nothing but type imports: plain Node, the tests and the
 * pages all load it as is.
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
 * and a gradient, and six pages that use every W1 template, items, tones, tabs
 * and a tree (logo-use sits under logo). Every page links and binds only what
 * is there, so get_page answers it with no missing keys and no warnings.
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
