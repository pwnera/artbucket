import type { Item, Section, Template } from "@/lib/pages";
import type { ViewRule } from "@/lib/site";

/**
 * How a template's items are made and set up on the canvas: what a new one
 * starts as, and which of an item's fields the section panel offers (its
 * words are typed where they read, and its picture is picked there).
 */

/** A new item: ready to type into, or `asset` when it is its picture (picked first, an item per picture). */
export type Blank = { kind: "item"; item: Item } | { kind: "asset"; /** What each picked picture's item carries besides it. */ with: Partial<Item> };

/** Where each color rule lives, the section's first: what a logos don't sits on. */
const firstColor = (s: Section, rules: ViewRule[]) =>
  s.keys.find((k) => rules.some((r) => r.key === k && r.type === "color")) ?? rules.find((r) => r.type === "color")?.key;

/** What a new item of the section's template starts as; null where it takes none, or can't be made here. */
export function blankItem(s: Section, rules: ViewRule[], pages: string[]): Blank | null {
  switch (s.template) {
    case "cards":
    case "faq":
      return { kind: "item", item: { title: "" } };
    case "dodont":
      return { kind: "item", item: { verdict: "do", title: "" } };
    case "annotated":
      return { kind: "item", item: { at: [50, 50], title: "" } };
    case "pages": {
      const featured = new Set((s.items ?? []).map((x) => x.link));
      const next = pages.find((p) => !featured.has(`/${p}`)) ?? pages[0];
      return next ? { kind: "item", item: { link: `/${next}` } } : null;
    }
    case "gallery":
    case "links":
      return { kind: "asset", with: {} };
    case "diagram":
      // A co-brand draws its first item only: the partner's mark.
      return s.items?.length ? null : { kind: "asset", with: {} };
    case "logos": {
      const key = firstColor(s, rules);
      return key ? { kind: "asset", with: { key, verdict: "dont" } } : null;
    }
    default:
      return null;
  }
}

/** An item's fields the panel sets, beyond its words and picture. `level` only means something in a cards tree, `span` in a bento. */
export const ITEM_FIELDS: Partial<Record<Template, (keyof Item)[]>> = {
  cards: ["icon", "link", "label", "level"],
  dodont: ["verdict"],
  gallery: ["span", "download"],
  links: ["link", "label", "download"],
  pages: ["link"],
  logos: ["key"],
  annotated: ["at", "key"],
};

/** What the canvas's add button says, by template. */
export const ADD_LABEL: Partial<Record<Template, string>> = {
  cards: "Add a card",
  faq: "Add a question",
  dodont: "Add a do or don't",
  annotated: "Add a hotspot",
  pages: "Add a page",
  gallery: "Add pictures",
  links: "Add files",
  diagram: "Add their mark",
  logos: "Add a don't",
};
