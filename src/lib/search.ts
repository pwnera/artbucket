/**
 * Pure helpers for the search path. The database does the searching; these
 * only shape what goes into it.
 */

export const MAX_TAGS = 100;
export const MAX_TAG_LENGTH = 64;

/** Tags are case-insensitive and single-spaced, so "Brand " and "brand" are one tag. */
export function normalizeTags(tags: readonly string[]): string[] {
  const out = tags
    .map((t) => t.trim().replace(/\s+/g, " ").toLowerCase().slice(0, MAX_TAG_LENGTH))
    .filter(Boolean);
  return [...new Set(out)].slice(0, MAX_TAGS);
}

/**
 * Turn what a person typed into a tsquery where every word must match, each as
 * a prefix: "fox her" finds "fox_hero_v3.png". User input never reaches the
 * tsquery grammar: anything that is not a letter or digit is a separator, so
 * `&`, `|`, `!` and `:` cannot be injected. Returns null when nothing is left.
 */
export function prefixQuery(q: string): string | null {
  const words = q.toLowerCase().match(/[\p{L}\p{N}]+/gu);
  return words ? words.slice(0, 16).map((w) => `${w}:*`).join(" & ") : null;
}
