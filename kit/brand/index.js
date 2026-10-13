// @artbucket/brand: one release of a brand, read at build time from what `artbucket brand export` wrote
// (brand.json, tokens.css and the files they point at), and the manifest of what the site used.
// MIT License, see LICENSE.
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * The release exported into `dir` (.brand by default). Every rule, file and
 * address the build asks for is noted: `writeManifest` turns them into
 * artbucket.site.json, which gives the site its lineage and its check in
 * Artbucket, and lets a release that changes none of them skip its rebuild.
 */
export async function loadBrand(dir = ".brand") {
  const text = await readFile(join(dir, "brand.json"), "utf8").catch(() => {
    throw new Error(`No ${dir}/brand.json: export the brand first (npx artbucket brand export ${dir} --brand <slug>)`);
  });
  return new Brand(JSON.parse(text), dir);
}

/** Rules read, as the manifest names them: a key, `color.*` for a group, `*` for every one. */
const groupOf = (key) => (key.includes(".") ? `${key.slice(0, key.indexOf("."))}.*` : key);

export class Brand {
  #data;
  #dir;
  #rules = new Set();
  #assets = new Set();
  #files = new Set();

  constructor(data, dir = ".brand") {
    this.#data = data;
    this.#dir = dir;
  }

  get slug() {
    return this.#data.slug;
  }
  get name() {
    return this.#data.name ?? this.#data.slug;
  }
  /** The release this is, or null when the brand had none yet (as it stood). */
  get release() {
    return this.#data.release ?? null;
  }
  /** The Artbucket it came from, for live addresses. */
  get server() {
    return this.#data.server ?? null;
  }
  get contexts() {
    return this.#data.contexts ?? [];
  }

  /** Every rule, in every context: reading them all means any change reaches this site. */
  all() {
    this.#rules.add("*");
    return this.#data.rules;
  }

  /** A rule by key, its default value or a context's. */
  rule(key, context = null) {
    this.#rules.add(key);
    return this.#data.rules.find((r) => r.key === key && (r.context ?? null) === context);
  }

  value(key, fallback, context = null) {
    return this.rule(key, context)?.value ?? fallback;
  }

  /** A text rule's words, or the fallback. */
  text(key, fallback = "") {
    const r = this.rule(key);
    return r && typeof r.value === "string" ? r.value : fallback;
  }

  /** The rules of a group (`color.*`) or of a type (`{ type: "font" }`), default values. */
  rules(which) {
    if (typeof which === "string") {
      this.#rules.add(which);
      const prefix = which.endsWith(".*") ? which.slice(0, -1) : null;
      return this.#data.rules.filter((r) => (r.context ?? null) === null && (prefix ? r.key.startsWith(prefix) : r.key === which));
    }
    const found = this.#data.rules.filter((r) => (r.context ?? null) === null && (!which?.type || r.type === which.type));
    // A type is read through its groups: a rule added to one of them reaches this site.
    for (const r of found) this.#rules.add(which?.type ? groupOf(r.key) : "*");
    return found;
  }

  /** The rule of a type whose key says one of the words (primary, accent), else (`any`) the first of that type. */
  pick(type, words, any = true) {
    const all = this.rules({ type });
    return words.map((w) => all.find((r) => r.key.toLowerCase().includes(w))).find(Boolean) ?? (any ? all[0] : undefined);
  }

  /** A rule's file as the site serves it: its path in the export (assets/...), copied by `copyFiles`. */
  file(asset) {
    if (!asset?.file) return null;
    this.#assets.add(asset.id);
    this.#files.add(asset.file);
    return asset.file;
  }

  /** A file the export holds, by its path (a text rule's link to assets/...): its asset, noted, or null. */
  fileAt(path) {
    const id = this.#data.files?.[path];
    if (!id) return null;
    this.#assets.add(id);
    this.#files.add(path);
    return path;
  }

  /**
   * An asset's live address on the server, following its current version
   * (/c/), so a new logo shows without a rebuild. Public assets only: a
   * private one's address asks a visitor to sign in.
   */
  liveUrl(id, transform) {
    if (!this.server) throw new Error("This export names no server: export it again with a newer CLI");
    this.#assets.add(id);
    return `${this.server}/c/${id}${transform ? `/${transform}` : ""}`;
  }

  /** tokens.css: every rule as a custom property, its fonts' @font-face. Every rule is read, and the files it names. */
  async tokensCss() {
    this.#rules.add("*");
    const css = await readFile(join(this.#dir, "tokens.css"), "utf8");
    for (const m of css.matchAll(/url\("?(assets\/[^")]+)"?\)/g)) this.fileAt(m[1]);
    return css;
  }

  /** The files used so far, copied from the export into `out` at the same paths. */
  async copyFiles(out) {
    for (const path of this.#files) {
      await mkdir(dirname(join(out, path)), { recursive: true });
      await copyFile(join(this.#dir, path), join(out, path));
    }
    return [...this.#files];
  }

  /** What the site used: the brand, the release, the rules read and the assets. */
  manifest() {
    const rules = this.#rules.has("*") ? ["*"] : [...this.#rules].sort();
    return { brand: this.slug, release: this.release?.number ?? null, rules, assets: [...this.#assets] };
  }

  /** artbucket.site.json in `out`, which Artbucket reads as the site deploys. */
  async writeManifest(out) {
    const m = this.manifest();
    await mkdir(out, { recursive: true });
    await writeFile(join(out, "artbucket.site.json"), JSON.stringify(m, null, 2) + "\n");
    return m;
  }
}
