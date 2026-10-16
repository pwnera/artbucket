/**
 * Artbucket's names where Acme's were, for artbucket.io, which frames these stories to show the app as it is
 * (`iframe.html?id=...&globals=fixture:artbucket`): the same made-up people, files and numbers, on our own brand.
 * The preview swaps a story's args; `inApp`, `as` and `withMe` swap who is looking and the sidebar.
 * ponytail: a swap of names, so every story has it at once; what was written for Acme beyond its name (a partner,
 * a picture) stays as it was. A story that needs more gets args of its own when the site frames it.
 */
const NAMES: [RegExp, string][] = [
  [/Acme Inc/g, "Artbucket"],
  [/acme\.test/g, "artbucket.io"],
  [/Acme/g, "Artbucket"],
  [/acme/g, "artbucket"],
];

const swap = (v: unknown): unknown => {
  if (typeof v === "string") return NAMES.reduce((s, [from, to]) => s.replace(from, to), v);
  if (Array.isArray(v)) return v.map(swap);
  // Plain data only: a React element, a function or a Date passes as it is.
  if (typeof v === "object" && v && Object.getPrototypeOf(v) === Object.prototype && !("$$typeof" in v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x)]));
  return v;
};

/** `value` as the story's fixture global asks: Acme's own, or with Artbucket's names. */
export const fixture = <T>(globals: Record<string, unknown>, value: T): T => (globals.fixture === "artbucket" ? (swap(value) as T) : value);
