/** A rule as `artbucket brand export` writes it into brand.json. */
export type Rule = {
  key: string;
  type: string;
  value: unknown;
  context: string | null;
  label: string | null;
  usage: string | null;
  spec: Record<string, unknown> | null;
  assets: { id: string; mime?: string | null; file?: string; rendition?: string | null }[];
};
export type Release = { number: number; publishedAt: string; note?: string | null };
/** artbucket.site.json: what a build used, read by Artbucket as it deploys. */
export type Manifest = { brand: string; release: number | null; rules: string[]; assets: string[] };

/** The release exported into `dir` (.brand by default). */
export declare function loadBrand(dir?: string): Promise<Brand>;

export declare class Brand {
  constructor(data: unknown, dir?: string);
  readonly slug: string;
  readonly name: string;
  /** The release this is, or null when the brand had none yet. */
  readonly release: Release | null;
  /** The Artbucket it came from. */
  readonly server: string | null;
  readonly contexts: unknown[];
  /** Every rule, in every context: any change then reaches this site. */
  all(): Rule[];
  /** A rule by key, its default value or a context's. */
  rule(key: string, context?: string | null): Rule | undefined;
  value<T = unknown>(key: string, fallback?: T, context?: string | null): T;
  /** A text rule's words, or the fallback. */
  text(key: string, fallback?: string): string;
  /** The rules of a group (`color.*`), a key, or a type (`{ type: "font" }`). */
  rules(which?: string | { type?: string }): Rule[];
  /** The rule of a type whose key says one of the words, else (`any`) the first of that type. */
  pick(type: string, words: string[], any?: boolean): Rule | undefined;
  /** A rule's file as the site serves it (assets/...), or null. */
  file(asset: Rule["assets"][number] | undefined): string | null;
  /** A file the export holds, by its path: noted, or null. */
  fileAt(path: string): string | null;
  /** An asset's live address on the server, following its current version (/c/). */
  liveUrl(id: string, transform?: string): string;
  /** tokens.css: every rule as a custom property, and the files it names. */
  tokensCss(): Promise<string>;
  /** The files used so far, copied into `out`; their paths. */
  copyFiles(out: string): Promise<string[]>;
  manifest(): Manifest;
  /** artbucket.site.json in `out`. */
  writeManifest(out: string): Promise<Manifest>;
}
