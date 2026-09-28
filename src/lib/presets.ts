import type { RuleType, RuleValue } from "./rules.ts";

/**
 * What people add to brand guidelines, as ready-made rules: a name, where it
 * goes, what kind of value, and a starting value to overwrite. The editor's
 * "/" menu is this list (the ghost line under each section, or under a rule
 * from its + or "/"), so nobody has to know that a clear-space rule is a text
 * rule keyed `logo.minClearSpace`.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

export type Preset = {
  id: string;
  label: string;
  hint: string;
  section: string;
  type: RuleType;
  /** The rule's name, in words. Omitted: the editor asks for one. */
  name?: string;
  /** Suggested when asking. */
  suggest?: string;
  value: RuleValue;
  usage?: string;
  /** Open the asset picker once made: the rule is mostly its files. */
  assets?: true;
};

export const PRESETS: Preset[] = [
  { id: "color", label: "Brand color", hint: "A swatch, with contrast checks", section: "color", type: "color", suggest: "Secondary", value: "#888888" },
  { id: "color-pairs", label: "Color pairings", hint: "Which colors go together", section: "color", type: "list", name: "Pairings", value: ["Primary on white", "White on primary"] },
  { id: "color-never", label: "Color don'ts", hint: "Combinations to avoid", section: "color", type: "list", name: "Never do", value: ["Primary text on dark gray"] },

  { id: "logo-file", label: "Logo files", hint: "The approved versions, from the library", section: "logo", type: "text", suggest: "Primary lockup", value: "The approved logo", assets: true },
  { id: "logo-space", label: "Clear space", hint: "Room around the mark", section: "logo", type: "text", name: "Min clear space", value: "Half the mark's height on every side" },
  { id: "logo-size", label: "Minimum size", hint: "Smallest it may appear", section: "logo", type: "number", name: "Min size", value: 24, usage: "Pixels on screen." },
  { id: "logo-do", label: "Logo do's", hint: "How the mark should be used", section: "logo", type: "list", name: "Do", value: ["Use the approved files as they are"] },
  { id: "logo-never", label: "Logo don'ts", hint: "How the mark is never used", section: "logo", type: "list", name: "Never do", value: ["Stretch or skew it", "Recolor it"] },

  { id: "type-face", label: "Typeface", hint: "A font family with its files, shown in that face", section: "type", type: "font", suggest: "Headings", value: "Inter" },
  { id: "type-scale", label: "Type scale", hint: "The sizes, as a specimen", section: "type", type: "list", name: "Scale", value: [12, 14, 16, 20, 24, 32, 48] },
  { id: "type-weight", label: "Weights", hint: "Which weights, for what", section: "type", type: "list", name: "Weights", value: ["Regular for body", "Semibold for headings"] },

  { id: "tone-voice", label: "Voice", hint: "How the brand sounds, in a sentence", section: "tone", type: "text", name: "Voice", value: "Plain, warm, and specific." },
  { id: "tone-do", label: "Writing do's", hint: "Habits to keep", section: "tone", type: "list", name: "Always", value: ["Say what it does", "Use short sentences"] },
  { id: "tone-avoid", label: "Words to avoid", hint: "What never appears in copy", section: "tone", type: "list", name: "Avoid", value: ["Hype", "Jargon"] },

  { id: "imagery", label: "Imagery style", hint: "What photos and illustration look like", section: "imagery", type: "text", name: "Style", value: "Natural light, real people, no stock poses", assets: true },

  { id: "text", label: "Text", hint: "A sentence or a value", section: "", type: "text", value: "Write the rule" },
  { id: "number", label: "Number", hint: "A size, a ratio, a count", section: "", type: "number", value: 0 },
  { id: "list", label: "List", hint: "Items; name it like 'avoid' for don'ts", section: "", type: "list", value: ["First item"] },
  { id: "swatch", label: "Color", hint: "A hex value", section: "", type: "color", value: "#888888" },
];

/** The starter set an empty page offers: one of each thing most guidelines have. */
export const ESSENTIALS = ["logo-space", "logo-size", "logo-never", "type-scale", "tone-voice", "tone-avoid"];

/** "Min clear space" to "minClearSpace"; nothing a key can't hold survives. */
export function camel(words: string) {
  const parts = words
    .normalize("NFKD")
    .replace(/['’]/g, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    // A key starts with a letter: "2024 logo" is "logo", not "ogo".
    .replace(/^[^A-Za-z]+/, "")
    .trim()
    .split(" ")
    .filter(Boolean);
  // A word already in camelCase stays ("socialMedia", "iPhone"); any other is one lowercase word ("HTML", "iOS"),
  // so the label read back from the key is what was typed, not "I osicon".
  const word = (p: string) => (/^[a-z][a-z0-9]*([A-Z][a-z0-9]+)*$/.test(p) ? p : p.toLowerCase());
  return parts
    .map(word)
    .map((p, i) => (i ? p[0].toUpperCase() + p.slice(1) : p))
    .join("");
}

/**
 * The key for a rule named `name` in `section`, made unique against `taken`
 * by counting up: color.accent, color.accent2.
 */
export function keyFor(section: string, name: string, taken: Set<string>) {
  const base = [camel(section), camel(name)].filter(Boolean).join(".");
  if (!base || !base.includes(".")) return null;
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}${n}`;
  return key;
}
