/** A rule as `artbucket brand export` writes it into brand.json, or /api/v1/brand/rules answers it. */
export type Rule = {
  key: string;
  type: string;
  value: unknown;
  context?: string | null;
  label?: string | null;
  usage?: string | null;
  spec?: Record<string, unknown> | null;
  assets?: Asset[];
};
/** A file of a rule: `file` is its path in the export (assets/...). */
export type Asset = { id: string; mime?: string | null; file?: string; rendition?: string | null };
export type Options = {
  /** Which rules: keys, `color.*` for a group, `*` for all. All when left out. */
  keys?: string[];
  /** A context's values (dark-background, print); the default ones when left out. */
  context?: string | null;
  /** Where a file is served; by default its export path from the site's root. */
  src?: (asset: Asset) => string;
};
export type DoDontItem = { verdict?: "do" | "dont"; title?: string; text?: string; image?: string; caption?: string };

export declare const esc: (s: unknown) => string;
export declare const asks: (key: string, keys?: string[]) => boolean;
export declare const imageOf: (rule: Rule | undefined) => Asset | undefined;
export declare const familyOf: (rule: Rule) => string;
export declare const cssFamily: (rule: Rule) => string;
export declare function textOf(rule: Rule): string;
export declare function palette(rules: Rule[], o?: Options): string;
export declare function typeSpecimen(rules: Rule[], o?: Options & { sample?: string }): string;
export declare function logoGrid(rules: Rule[], o?: Options): string;
export declare function doDont(items: DoDontItem[]): string;
export declare function ruleList(rules: Rule[], o?: Options): string;
export declare function ruleValue(rule: Rule | undefined, o?: Pick<Options, "src">): string;
