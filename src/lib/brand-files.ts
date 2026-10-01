import { Document, isMap, isScalar, isSeq, LineCounter, parseDocument, visit } from "yaml";
import { checkWarnings, COLOR_SLOTS, deriveTheme, FONT_SLOTS, ThemeSettings } from "./brand-theme.ts";
import type { SnapRule } from "./history.ts";
import { canon, checkBindings, checkTree, MAX_PAGES, MAX_SECTIONS, PageInput, pageSlug, pageWarnings, parseSections, TEMPLATE_INFO, type Section, type SnapPage } from "./pages.ts";
import { RuleInput, ruleContext, ruleKey, section as groupOf, specKeys } from "./rules.ts";

/**
 * A brand as files, for a Git repository (brand as code): its rules, pages
 * and theme as YAML a person can read and review, and the files it shows
 * beside them. The same brand a version holds (core/brand.ts snapshot,
 * pageSnapshot, the theme), written out and read back.
 *
 *   brand.yaml          slug, name, theme, the order of rules/ and the page tree
 *   rules/color.yaml    the rules whose key starts with color., in order
 *   pages/logo.yaml     a page: its fields and sections
 *   assets/logo.svg     files the rules and pages point at by path
 *
 * Anywhere the API takes an asset id, a file takes the id or a path to a
 * file under assets/, which the caller uploads and resolves by content
 * (fromFiles `assets`). Writing is deterministic and leaves out every
 * default, so a brand written, read and written again is the same bytes, and
 * a file whose meaning did not change is kept as the person wrote it
 * (toFiles `previous`), comments and all.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

export type BrandState = { name: string; theme: ThemeSettings; rules: SnapRule[]; pages: SnapPage[] };
export type Files = Record<string, string>;
/** A problem in a file, at a line when one can be named. */
export type Problem = { file: string; line?: number; message: string };

export const BRAND_FILE = "brand.yaml";
const RULES_DIR = "rules/";
const PAGES_DIR = "pages/";
export const ASSETS_DIR = "assets/";
const HEADER = "# An Artbucket brand: rules in rules/, pages in pages/, files in assets/.\n";

/** Stands in for a file the caller has not uploaded yet, so the rest still checks. Never written. */
export const MISSING_ASSET = "00000000-0000-4000-8000-00000000f11e";

const TOP = ["slug", "name", "theme", "rules", "pages"] as const;
const RULE_FIELDS = ["type", "label", "value", "usage", "spec", "assets", "contexts"] as const;
const CONTEXT_FIELDS = ["type", "label", "value", "usage", "spec", "assets"] as const;
const PAGE_FIELDS = ["title", "eyebrow", "lede", "cover", "icon", "audience", "layout", "tabs", "hidden", "aliases", "translations", "sections"] as const;
/** A section's fields in the order a file lists them; any a later version adds come after. */
const SECTION_FIELDS = [
  "id",
  "template",
  "eyebrow",
  "title",
  "lede",
  "body",
  "aside",
  "keys",
  "items",
  "props",
  "tone",
  "background",
  "width",
  "columns",
  "size",
  "space",
  "tab",
  "audience",
  "contexts",
  "only",
  "hidden",
  "translations",
] as const;

type Json = unknown;
type Path = (string | number)[];
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const norm = (p: string) => p.replace(/^\.\//, "").replace(/\\/g, "/");
const strip = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)) as T;

/** Every string equal to a key of `swap` replaced by its value, anywhere in `v`. */
function swapStrings<T>(v: T, swap: (s: string) => string): T {
  if (typeof v === "string") return swap(v) as T;
  if (Array.isArray(v)) return v.map((x) => swapStrings(x, swap)) as T;
  if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swapStrings(x, swap)])) as T;
  return v;
}

// ---- the canonical state --------------------------------------------------------

const byPosition = (a: SnapRule, b: SnapRule) =>
  a.position - b.position || a.key.localeCompare(b.key) || (a.context ?? "").localeCompare(b.context ?? "");

/** The groups (rules/ files) in the order their first rule comes. */
function groupsOf(rules: SnapRule[]) {
  return [...new Set([...rules].sort(byPosition).map((r) => groupOf(r.key)))];
}

/** Pages in reading order: each page, then the pages under it, as the nav shows them. A parent that is not a page reads as none. */
function preorder(pages: SnapPage[]): { page: SnapPage; parent: string | null }[] {
  const slugs = new Set(pages.map((p) => p.slug));
  const parentOf = (p: SnapPage) => (p.parent && slugs.has(p.parent) && p.parent !== p.slug ? p.parent : null);
  const kids = new Map<string | null, SnapPage[]>();
  for (const p of [...pages].sort((a, b) => a.position - b.position || a.slug.localeCompare(b.slug))) {
    const k = parentOf(p);
    kids.set(k, [...(kids.get(k) ?? []), p]);
  }
  const out: { page: SnapPage; parent: string | null }[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null) => {
    for (const p of kids.get(parent) ?? []) {
      if (seen.has(p.slug)) continue;
      seen.add(p.slug);
      out.push({ page: p, parent });
      walk(p.slug);
    }
  };
  walk(null);
  // A loop has no way in from the top: its pages come last, at the top.
  for (const p of pages) if (!seen.has(p.slug)) out.push({ page: p, parent: null });
  return out;
}

/**
 * The state as files say it: rules numbered by group then key, pages by
 * reading order, no times, and nothing at its default. Two states that write
 * the same files are equal here.
 */
export function canonical(s: BrandState): BrandState {
  const groups = groupsOf(s.rules);
  const keys = [...new Set([...s.rules].sort((a, b) => groups.indexOf(groupOf(a.key)) - groups.indexOf(groupOf(b.key)) || byPosition(a, b)).map((r) => r.key))];
  const rules = s.rules
    .map((r) => ({
      key: r.key,
      context: r.context,
      type: r.type,
      // A font stored as a bare family reads as { family }, as the API reads it.
      value: r.type === "font" && typeof r.value === "string" ? { family: r.value } : r.value,
      usage: r.usage || null,
      position: keys.indexOf(r.key),
      assets: r.assets.map((a) => ({ id: a.id, rendition: a.rendition ?? null })),
      ...(r.label && { label: r.label }),
      ...(r.spec && Object.keys(r.spec).length && { spec: r.spec }),
    }))
    .sort(byPosition);
  const pages = preorder(s.pages).map(({ page: p, parent }, position) => {
    const rest: Partial<SnapPage> = { ...p };
    delete rest.updatedAt;
    delete rest.parent;
    return { ...rest, position, ...(parent && { parent }) } as SnapPage;
  });
  return { name: s.name, theme: themeInOrder(s.theme ?? {}), rules, pages };
}

/** The settings in the schema's order, whatever order they were set in, and none that is unset. */
function themeInOrder(t: ThemeSettings): ThemeSettings {
  const known = Object.keys(ThemeSettings.shape);
  const keys = [...known.filter((k) => k in t), ...Object.keys(t).filter((k) => !known.includes(k))];
  return strip(Object.fromEntries(keys.map((k) => [k, (t as Record<string, unknown>)[k]]))) as ThemeSettings;
}

/** Whether two states say the same: what a sync compares. */
export const sameState = (a: BrandState, b: BrandState) => canon(canonical(a)) === canon(canonical(b));

// ---- writing --------------------------------------------------------------------

/** YAML as a person would write it: short lists of words and numbers on one line, nothing folded. */
function yaml(v: Json, header = "", block?: string) {
  const doc = new Document(v, { aliasDuplicateObjects: false });
  visit(doc, {
    Seq(_, node, path) {
      // The page tree stays a tree, one page a line.
      const top = path[2] as { key?: { value?: unknown } } | undefined;
      if (block && top?.key?.value === block) return;
      if (node.items.every(isScalar) && node.items.map((i) => String((i as { value: unknown }).value)).join(", ").length <= 60) node.flow = true;
    },
  });
  return header + doc.toString({ lineWidth: 0, minContentWidth: 0, flowCollectionPadding: false });
}

/** A section's id when the file leaves it out: its template, then -2, -3 for the next of the same template on the page. */
function naturalIds(templates: string[]): string[] {
  const n = new Map<string, number>();
  return templates.map((t) => {
    const i = (n.get(t) ?? 0) + 1;
    n.set(t, i);
    return i === 1 ? t : `${t}-${i}`;
  });
}

function sectionOut(s: Section, natural: string) {
  const info = TEMPLATE_INFO[s.template];
  const defaults: Record<string, unknown> = { id: natural, title: "", body: "", width: info.width, columns: info.columns, tone: info.tone, hidden: false };
  const out: Record<string, unknown> = {};
  const rec = s as unknown as Record<string, unknown>;
  const fields = [...SECTION_FIELDS, ...Object.keys(rec).filter((k) => !(SECTION_FIELDS as readonly string[]).includes(k))];
  for (const k of fields) {
    const v = rec[k];
    if (v === undefined || v === null) continue;
    if (k in defaults && v === defaults[k]) continue;
    if ((k === "keys" || k === "items") && Array.isArray(v) && !v.length) continue;
    if (k === "props" && isObj(v) && !Object.keys(v).length) continue;
    out[k] = v;
  }
  return out;
}

const assetOut = (a: { id: string; rendition: string | null }) => (a.rendition ? { id: a.id, rendition: a.rendition } : a.id);

function ruleBody(r: SnapRule, type?: string) {
  return {
    ...(type && { type }),
    ...(r.label && { label: r.label }),
    value: r.value,
    ...(r.usage && { usage: r.usage }),
    ...(r.spec && { spec: r.spec }),
    ...(r.assets.length && { assets: r.assets.map(assetOut) }),
  };
}

function ruleFile(rules: SnapRule[]) {
  const out: Record<string, unknown> = {};
  for (const key of [...new Set(rules.map((r) => r.key))]) {
    const all = rules.filter((r) => r.key === key);
    const def = all.find((r) => r.context === null);
    const type = (def ?? all[0]).type;
    const ctx = all.filter((r) => r.context !== null);
    out[key] = {
      type,
      ...(def && ruleBody(def)),
      ...(ctx.length && { contexts: Object.fromEntries(ctx.map((c) => [c.context, ruleBody(c, c.type === type ? undefined : c.type)])) }),
    };
  }
  return out;
}

type Tree = (string | Record<string, Tree>)[];

function treeOf(pages: SnapPage[]): Tree {
  const under = (parent: string | null): Tree =>
    pages
      .filter((p) => (p.parent ?? null) === parent)
      .map((p) => {
        const kids = under(p.slug);
        return kids.length ? { [p.slug]: kids } : p.slug;
      });
  return under(null);
}

function pageFile(p: SnapPage) {
  const natural = naturalIds(p.sections.map((s) => s.template));
  return {
    title: p.title,
    ...(p.eyebrow && { eyebrow: p.eyebrow }),
    ...(p.lede && { lede: p.lede }),
    ...(p.cover && { cover: p.cover }),
    ...(p.icon && { icon: p.icon }),
    ...(p.audience && p.audience !== "everyone" && { audience: p.audience }),
    ...(p.layout === "landing" && { layout: p.layout }),
    ...(p.tabs && { tabs: true }),
    ...(p.hidden && { hidden: true }),
    ...(p.aliases?.length && { aliases: p.aliases }),
    ...(p.translations && Object.keys(p.translations).length && { translations: p.translations }),
    sections: p.sections.map((s, i) => sectionOut(s, natural[i])),
  };
}

/**
 * The brand as files. `paths` names assets that live in the repository (id
 * to path): they are written as their path, every other asset as its id.
 * With `previous`, the repository's files as they are: one that says the
 * same as what would be written is kept as it is, so a sync rewrites only
 * what changed.
 */
export function toFiles(state: BrandState, o: { paths?: Record<string, string>; previous?: Files; slug?: string } = {}): Files {
  const paths = o.paths ?? {};
  const s = canonical(swapStrings(state, (x) => (Object.hasOwn(paths, x) ? paths[x] : x)));
  const groups = groupsOf(s.rules);
  const out: Files = {
    [BRAND_FILE]: yaml(
      { ...(o.slug && { slug: o.slug }), name: s.name, ...(Object.keys(s.theme).length && { theme: s.theme }), ...(groups.length && { rules: groups }), ...(s.pages.length && { pages: treeOf(s.pages) }) },
      HEADER,
      "pages",
    ),
  };
  for (const g of groups) out[`${RULES_DIR}${g}.yaml`] = yaml(ruleFile(s.rules.filter((r) => groupOf(r.key) === g)));
  for (const p of s.pages) out[`${PAGES_DIR}${p.slug}.yaml`] = yaml(pageFile(p));
  if (!o.previous) return out;

  // Kept as the person wrote it when it reads the same. Read with paths as they are: both sides name files the same way.
  const prev = Object.fromEntries(Object.entries(o.previous).map(([k, v]) => [norm(k), v]));
  for (const [path, text] of Object.entries(out)) {
    const was = prev[path] ?? prev[path.replace(/\.yaml$/, ".yml")];
    if (was !== undefined && readsSame(path, was, text)) out[path] = was;
  }
  return out;
}

/** An id that stands for a path, the same every time: two files that name one path read alike. */
function idOfPath(path: string) {
  let h = 0x811c9dc5;
  let g = 0x01000193;
  for (const c of path) {
    h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
    g = Math.imul(g ^ c.charCodeAt(0), 0x811c9dc5) >>> 0;
  }
  const hex = (h.toString(16).padStart(8, "0") + g.toString(16).padStart(8, "0")).repeat(2);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function readsSame(path: string, a: string, b: string) {
  const swap = (s: string) => (norm(s).startsWith(ASSETS_DIR) ? idOfPath(norm(s)) : s);
  const one = (t: string) => {
    const f = readFile(path, t, swap);
    return f.problems.some((p) => p.level === "error") ? null : canon(f.data);
  };
  const x = one(a);
  return x !== null && x === one(b);
}

// ---- reading --------------------------------------------------------------------

type Level = "error" | "warning";
type Found = Problem & { level: Level };

/** A parsed file and the way back from a path in it to a line. */
class Doc {
  readonly problems: Found[] = [];
  readonly data: Json;
  private readonly doc: Document;
  private readonly lines = new LineCounter();
  readonly file: string;
  constructor(file: string, text: string) {
    this.file = file;
    this.doc = parseDocument(text, { lineCounter: this.lines, prettyErrors: false, uniqueKeys: true });
    for (const e of this.doc.errors) this.problems.push({ file, level: "error", line: this.lines.linePos(e.pos[0]).line, message: e.message.split("\n")[0] });
    let data: Json = null;
    // An alias bomb throws here: a problem in the file, like any other.
    try {
      if (!this.doc.errors.length) data = this.doc.toJS({ maxAliasCount: 100 });
    } catch (e) {
      this.problems.push({ file, level: "error", message: (e as Error).message });
    }
    this.data = data;
  }
  line(path: Path): number | undefined {
    for (let n = path.length; n >= 0; n--) {
      const node = this.doc.getIn(path.slice(0, n), true) as { range?: [number, number, number] } | undefined;
      // A key's value is found by the key's own line: getIn on its parent map, then the pair.
      const at = node && typeof node === "object" && node.range ? node.range[0] : undefined;
      if (at !== undefined) {
        const pair = n > 0 ? pairOf(this.doc, path.slice(0, n)) : undefined;
        return this.lines.linePos(pair ?? at).line;
      }
    }
    return undefined;
  }
  add(level: Level, path: Path, message: string) {
    this.problems.push({ file: this.file, level, line: this.line(path), message: path.length ? `${pathText(path)}: ${message}` : message });
  }
  /** A message from lib/pages.ts, "sections[2].props.limit: Too big", placed at its path under `base`. */
  addText(level: Level, text: string, base: Path = []) {
    const i = text.indexOf(": ");
    const head = i > 0 ? text.slice(0, i) : "";
    const path = /^[\w-]+(\[\d+\]|\.[\w-]+)*$/.test(head) ? [...head.matchAll(/([\w-]+)|\[(\d+)\]/g)].map((m) => (m[2] !== undefined ? Number(m[2]) : m[1])) : null;
    this.problems.push({ file: this.file, level, line: this.line(path ? [...base, ...path] : base), message: text });
  }
}

/** Where a map's key starts, so a problem with a value points at the line that names it. */
function pairOf(doc: Document, path: Path): number | undefined {
  const parent = path.length > 1 ? doc.getIn(path.slice(0, -1), true) : doc.contents;
  const last = path[path.length - 1];
  if (isMap(parent)) {
    const pair = parent.items.find((p) => (p.key as { value?: unknown })?.value === last);
    return (pair?.key as { range?: [number, number, number] } | undefined)?.range?.[0];
  }
  if (isSeq(parent) && typeof last === "number") return (parent.items[last] as { range?: [number, number, number] } | undefined)?.range?.[0];
  return undefined;
}

const pathText = (p: Path) => p.reduce<string>((s, k) => (typeof k === "number" ? `${s}[${k}]` : s ? `${s}.${k}` : k), "");

function unknownFields(d: Doc, v: Record<string, unknown>, allowed: readonly string[], at: Path, why?: Record<string, string>) {
  for (const k of Object.keys(v)) {
    if (!allowed.includes(k)) d.add("error", [...at, k], why?.[k] ?? `not a field here; one of ${allowed.join(", ")}`);
  }
}

/** A zod error's issues at their paths under `at`. */
function zodIssues(d: Doc, err: { issues: { path: PropertyKey[]; message: string; code: string; keys?: string[] }[] }, at: Path) {
  for (const i of err.issues) {
    const path = [...at, ...i.path.map((k) => (typeof k === "number" ? k : String(k)))];
    if (i.code === "unrecognized_keys") for (const k of i.keys ?? []) d.add("error", [...path, k], "not a field here");
    else d.add("error", path, i.message);
  }
}

type BrandData = { slug: string | null; name: string; theme: ThemeSettings; groups: string[] | null; tree: Tree | null };
type RuleData = Omit<SnapRule, "position">[];
type PageData = Omit<SnapPage, "position" | "parent" | "updatedAt">;
type Read = { data: Json; problems: Found[]; doc: Doc };

/** One file read on its own: what it says, with the asset paths already swapped for ids. */
function readFile(path: string, text: string, swap: (s: string) => string): Read {
  const d = new Doc(path, text);
  const raw = d.data === null ? null : swapStrings(d.data, swap);
  if (d.problems.length) return { data: null, problems: [...d.problems], doc: d };
  const data = path === BRAND_FILE ? readBrand(d, raw) : path.startsWith(RULES_DIR) ? readRules(d, raw) : readPage(d, raw);
  // A copy: what fromFiles adds to the file later is told apart from what reading it found.
  return { data, problems: [...d.problems], doc: d };
}

function readBrand(d: Doc, raw: Json): BrandData | null {
  if (!isObj(raw)) {
    d.add("error", [], "brand.yaml is a map: slug, name, theme, rules, pages");
    return null;
  }
  unknownFields(d, raw, TOP, []);
  const slug = raw.slug === undefined || raw.slug === null ? null : String(raw.slug);
  if (slug !== null && !ruleContext.safeParse(slug).success) d.add("error", ["slug"], "the brand's slug, e.g. acme-studio");
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name || name.length > 120) d.add("error", ["name"], "the brand's name, 1 to 120 characters");
  let theme: ThemeSettings = {};
  if (raw.theme !== undefined) {
    const t = ThemeSettings.safeParse(isObj(raw.theme) ? strip(raw.theme) : raw.theme);
    if (t.success) theme = t.data;
    else zodIssues(d, t.error, ["theme"]);
  }
  let groups: string[] | null = null;
  if (raw.rules !== undefined) {
    if (!Array.isArray(raw.rules) || raw.rules.some((g) => typeof g !== "string")) d.add("error", ["rules"], "the files in rules/ in order, by name: [color, type, logo]");
    else {
      groups = raw.rules as string[];
      groups.forEach((g, i) => groups!.indexOf(g) !== i && d.add("error", ["rules", i], `${g} is listed twice`));
    }
  }
  let tree: Tree | null = null;
  if (raw.pages !== undefined) {
    if (!Array.isArray(raw.pages)) d.add("error", ["pages"], "the page tree: a list of slugs, a page with pages under it as { slug: [...] }");
    else tree = raw.pages as Tree;
  }
  return { slug, name, theme, groups, tree };
}

function readRules(d: Doc, raw: Json): RuleData | null {
  if (raw === null || raw === undefined) return [];
  if (!isObj(raw)) {
    d.add("error", [], "a map of rules by key: color.primary: { type, value }");
    return null;
  }
  const out: RuleData = [];
  for (const [key, entry] of Object.entries(raw)) {
    if (!ruleKey.safeParse(key).success) {
      d.add("error", [key], "not a rule key: dotted camelCase, e.g. color.primary");
      continue;
    }
    if (!isObj(entry)) {
      d.add("error", [key], "a rule is a map: type, value, usage...");
      continue;
    }
    unknownFields(d, entry, RULE_FIELDS, [key]);
    const one = (e: Record<string, unknown>, context: string | null, at: Path, type: unknown) => {
      const input = { key, type, context: context ?? undefined, label: e.label, value: e.value, usage: e.usage, spec: e.spec, assets: e.assets };
      const got = RuleInput.safeParse(strip(input));
      if (!got.success) return zodIssues(d, got.error, at);
      const r = got.data;
      const spec = "spec" in r && r.spec && Object.keys(r.spec).length ? r.spec : null;
      out.push({
        key,
        context,
        type: r.type,
        value: r.value,
        usage: r.usage || null,
        assets: (r.assets ?? []).map((a) => ({ id: a.id, rendition: a.rendition ?? null })),
        ...(r.label && { label: r.label }),
        ...(spec && { spec }),
      });
    };
    if ("value" in entry) one(entry, null, [key], entry.type);
    else {
      const extra = Object.keys(entry).filter((k) => !["type", "contexts"].includes(k));
      if (extra.length) d.add("error", [key, extra[0]], "a rule with no value (only context versions) takes type and contexts");
    }
    if (entry.contexts !== undefined) {
      if (!isObj(entry.contexts)) d.add("error", [key, "contexts"], "a map of context versions: dark-background: { value }");
      else {
        for (const [ctx, c] of Object.entries(entry.contexts)) {
          const at = [key, "contexts", ctx];
          if (!ruleContext.safeParse(ctx).success) d.add("error", at, "not a context: a slug, e.g. dark-background");
          else if (!isObj(c)) d.add("error", at, "a context version is a map: value, usage...");
          else {
            unknownFields(d, c, CONTEXT_FIELDS, at);
            one(c, ctx, at, c.type ?? entry.type);
          }
        }
      }
    }
    if (!("value" in entry) && entry.contexts === undefined) d.add("error", [key], "needs a value, or context versions");
  }
  return out;
}

/** Sections as written, each given its natural id when it has none (naturalIds), and never one another section names. */
function withIds(raw: unknown[]): unknown[] {
  const named = new Set(raw.flatMap((s) => (isObj(s) && typeof s.id === "string" ? [s.id] : [])));
  const templates = raw.map((s) => (isObj(s) && typeof s.template === "string" ? s.template : "section"));
  const natural = naturalIds(templates);
  return raw.map((s, i) => {
    if (!isObj(s) || typeof s.id === "string") return s;
    let id = natural[i];
    for (let n = 2; named.has(id); n++) id = `${templates[i]}-${n}`;
    named.add(id);
    return { id, ...s };
  });
}

function readPage(d: Doc, raw: Json): PageData | null {
  if (!isObj(raw)) {
    d.add("error", [], "a page is a map: title, sections...");
    return null;
  }
  const placed = "set by brand.yaml's pages tree, where the page sits";
  unknownFields(d, raw, PAGE_FIELDS, [], { parent: placed, position: placed, slug: "the file's name is the page's slug" });
  const { sections: rawSections, aliases, ...rest } = raw;
  const fields = Object.fromEntries(Object.entries(rest).filter(([k]) => (PAGE_FIELDS as readonly string[]).includes(k)));
  const page = PageInput.safeParse({ ...strip(fields), sections: [] });
  const sectionList = Array.isArray(rawSections) ? withIds(rawSections) : [];
  if (rawSections !== undefined && !Array.isArray(rawSections)) d.add("error", ["sections"], "a list of sections, top to bottom");
  if (sectionList.length > MAX_SECTIONS) d.add("error", ["sections"], `${sectionList.length} sections; a page takes ${MAX_SECTIONS} at most`);
  const { sections, errors } = parseSections(sectionList);
  for (const e of errors) d.addText("error", e);
  let al: string[] = [];
  if (aliases !== undefined) {
    if (!Array.isArray(aliases) || aliases.some((a) => !pageSlug.safeParse(a).success)) d.add("error", ["aliases"], "old slugs of the page, as a list");
    else al = [...new Set(aliases as string[])];
  }
  if (!page.success) {
    zodIssues(d, page.error, []);
    return null;
  }
  if (errors.length || sectionList.length > MAX_SECTIONS) return null;
  const p = page.data;
  return {
    slug: "",
    title: p.title,
    hidden: p.hidden ?? false,
    sections,
    ...(p.eyebrow && { eyebrow: p.eyebrow }),
    ...(p.lede && { lede: p.lede }),
    ...(p.cover && { cover: p.cover }),
    ...(p.icon && { icon: p.icon }),
    ...(p.audience && p.audience !== "everyone" && { audience: p.audience }),
    ...(p.tabs && { tabs: true as const }),
    ...(al.length && { aliases: al }),
    ...(p.layout === "landing" && { layout: "landing" as const }),
    ...(p.translations && Object.keys(p.translations).length && { translations: p.translations }),
  };
}

/** The tree in brand.yaml as pages in reading order with their parents, and its problems. */
function readTree(d: Doc, tree: Tree): { slug: string; parent: string | null; at: Path }[] {
  const out: { slug: string; parent: string | null; at: Path }[] = [];
  const walk = (list: unknown, parent: string | null, at: Path) => {
    if (!Array.isArray(list)) {
      d.add("error", at, "a list of pages");
      return;
    }
    list.forEach((e, i) => {
      // `- 404` is a number to YAML, and a page slug.
      if (typeof e === "string" || typeof e === "number") {
        out.push({ slug: String(e), parent, at: [...at, i] });
        return;
      }
      if (isObj(e) && Object.keys(e).length === 1) {
        const [slug, kids] = Object.entries(e)[0];
        out.push({ slug, parent, at: [...at, i] });
        return walk(kids, slug, [...at, i, slug]);
      }
      d.add("error", [...at, i], "a page's slug, or { slug: [pages under it] }");
    });
  };
  walk(tree, null, ["pages"]);
  return out;
}

export type Parsed = {
  /** The brand the files say, when they say it without errors. */
  state: BrandState | null;
  errors: Problem[];
  warnings: Problem[];
  /** Paths under assets/ the files point at that `assets` does not name: upload them, then read again. */
  missing: string[];
  /** The paths the files point at, with the asset each is. */
  used: Record<string, string>;
};

/**
 * Read a brand from its files. `assets` names the files it may point at
 * (path to asset id, resolved by the caller from their content). Checks
 * everything the API would refuse, file by file with lines, and warns about
 * what readers would trip on; what needs the library (that an id is a live
 * asset, that a collection is there) is left to core/brand-sync.ts. `slug`:
 * the brand they are read into, which a brand.yaml naming another refuses.
 */
export function fromFiles(files: Files, o: { assets?: Record<string, string>; slug?: string } = {}): Parsed {
  const assets = Object.fromEntries(Object.entries(o.assets ?? {}).map(([k, v]) => [norm(k), v]));
  const missing = new Set<string>();
  const used: Record<string, string> = {};
  const swap = (s: string) => {
    const p = norm(s);
    if (Object.hasOwn(assets, p)) return (used[p] = assets[p]);
    if (p.startsWith(ASSETS_DIR) && p.length > ASSETS_DIR.length) {
      missing.add(p);
      return MISSING_ASSET;
    }
    return s;
  };
  const all = Object.fromEntries(Object.entries(files).map(([k, v]) => [norm(k), v]));
  const problems: Found[] = [];
  const pick = (dir: string) =>
    Object.keys(all)
      .filter((f) => f.startsWith(dir) && /\.ya?ml$/.test(f) && !f.slice(dir.length).includes("/"))
      .sort();

  const brandPath = BRAND_FILE in all ? BRAND_FILE : "brand.yml" in all ? "brand.yml" : null;
  if (!brandPath) problems.push({ file: BRAND_FILE, level: "error", message: "missing: a brand's files start with brand.yaml" });
  const read = (path: string, as: string) => readFile(as, all[path], swap);
  const brand = brandPath ? read(brandPath, BRAND_FILE) : null;
  const top = (brand?.data ?? null) as BrandData | null;
  if (brand) problems.push(...brand.problems.map((p) => ({ ...p, file: brandPath! })));

  // Rules, by file: rules/color.yaml is the group color.
  const ruleFiles = pick(RULES_DIR);
  const nameOf = (f: string) => f.slice(f.lastIndexOf("/") + 1).replace(/\.ya?ml$/, "");
  const twice = (list: string[], dir: string) => {
    const names = list.map(nameOf);
    names.forEach((n, i) => names.indexOf(n) !== i && problems.push({ file: list[i], level: "error", message: `${dir}${n}.yaml and ${dir}${n}.yml: keep one` }));
  };
  twice(ruleFiles, RULES_DIR);
  const readRuleFiles = ruleFiles.map((f) => ({ file: f, group: nameOf(f), ...read(f, `${RULES_DIR}${nameOf(f)}.yaml`) }));
  for (const r of readRuleFiles) problems.push(...r.problems.map((p) => ({ ...p, file: r.file })));

  const listed = top?.groups ?? null;
  const groupNames = readRuleFiles.map((r) => r.group);
  if (listed && brand) {
    listed.forEach((g, i) => !groupNames.includes(g) && brand.doc.add("error", ["rules", i], `no file rules/${g}.yaml`));
    for (const g of groupNames.filter((x) => !listed.includes(x)).sort()) {
      problems.push({ file: `${RULES_DIR}${g}.yaml`, level: "warning", message: `not in brand.yaml's rules, so its rules come last` });
    }
  }
  const order = [...(listed ?? []).filter((g) => groupNames.includes(g)), ...groupNames.filter((g) => !listed?.includes(g)).sort()];
  const rules: SnapRule[] = [];
  const seen = new Map<string, string>();
  let position = 0;
  for (const g of order) {
    const r = readRuleFiles.find((x) => x.group === g)!;
    const keys: string[] = [];
    for (const rule of (r.data as RuleData | null) ?? []) {
      const id = `${rule.key}\u0000${rule.context ?? ""}`;
      if (seen.has(id)) {
        r.doc.add("error", rule.context ? [rule.key, "contexts", rule.context] : [rule.key], `also in ${seen.get(id)}`);
        continue;
      }
      seen.set(id, r.file);
      if (!keys.includes(rule.key)) keys.push(rule.key);
      rules.push({ ...rule, position: position + keys.indexOf(rule.key) });
    }
    position += keys.length;
    // A key in the wrong file is fine to read, but a sync writes it where it belongs.
    for (const k of keys) if (groupOf(k) !== g) r.doc.add("warning", [k], `a ${groupOf(k)} rule; a sync moves it to rules/${groupOf(k)}.yaml`);
    problems.push(...r.doc.problems.filter((p) => !r.problems.includes(p)).map((p) => ({ ...p, file: r.file })));
  }

  // Specs name color rules of the brand.
  const colors = new Set(rules.filter((r) => r.type === "color").map((r) => r.key));
  for (const r of rules) {
    for (const k of specKeys(r.spec)) {
      if (colors.has(k)) continue;
      const f = readRuleFiles.find((x) => (x.data as RuleData | null)?.some((y) => y.key === r.key && y.context === r.context));
      f?.doc.add("error", r.context ? [r.key, "contexts", r.context, "spec"] : [r.key, "spec"], `names ${k}, which is not a color rule of this brand`);
      if (f) problems.push({ ...f.doc.problems[f.doc.problems.length - 1], file: f.file });
    }
  }

  // Pages, by file, placed by the tree.
  const pageFiles = pick(PAGES_DIR);
  twice(pageFiles, PAGES_DIR);
  const readPages = pageFiles.map((f) => {
    const slug = nameOf(f);
    const got = read(f, `${PAGES_DIR}${slug}.yaml`);
    if (!pageSlug.safeParse(slug).success) got.problems.push({ file: f, level: "error", message: `${slug} is not a page slug: lowercase words joined by -` });
    return { file: f, slug, ...got };
  });
  for (const p of readPages) problems.push(...p.problems.map((x) => ({ ...x, file: p.file })));
  const slugs = readPages.map((p) => p.slug);
  const placed = top?.tree && brand ? readTree(brand.doc, top.tree) : slugs.map((slug) => ({ slug, parent: null, at: [] as Path }));
  if (top?.tree && brand) {
    const count = new Map<string, number>();
    for (const e of placed) {
      count.set(e.slug, (count.get(e.slug) ?? 0) + 1);
      if (count.get(e.slug) === 2) brand.doc.add("error", e.at, `${e.slug} is in the tree twice`);
      if (!slugs.includes(e.slug)) brand.doc.add("error", e.at, `no file pages/${e.slug}.yaml`);
    }
    for (const s of slugs.filter((x) => !count.has(x))) {
      problems.push({ file: `${PAGES_DIR}${s}.yaml`, level: "warning", message: `not in brand.yaml's pages, so it sits last, at the top` });
      placed.push({ slug: s, parent: null, at: [] });
    }
  }
  const order2 = placed.filter((e, i) => slugs.includes(e.slug) && placed.findIndex((x) => x.slug === e.slug) === i);
  const pages: SnapPage[] = order2.flatMap((e, position) => {
    const data = readPages.find((p) => p.slug === e.slug)?.data as PageData | null;
    return data ? [{ ...data, slug: e.slug, position, ...(e.parent && { parent: e.parent }) }] : [];
  });
  if (brand) for (const e of checkTree(pages)) brand.doc.add("error", ["pages"], e);
  if (pages.length > MAX_PAGES) problems.push({ file: BRAND_FILE, level: "error", message: `${pages.length} pages; a brand takes ${MAX_PAGES} at most` });

  // Sections bind rules that are there, and the kind their template shows.
  for (const p of pages) {
    const f = readPages.find((x) => x.slug === p.slug)!;
    for (const e of checkBindings(p.sections, rules)) f.doc.addText("error", e);
    for (const w of pageWarnings(p, pages, rules)) if (!w.includes(": no rule ")) f.doc.addText("warning", w);
    problems.push(...f.doc.problems.filter((x) => !f.problems.includes(x)).map((x) => ({ ...x, file: f.file })));
  }

  // The theme names rules of the kind each part needs, and reads well.
  if (top && brand) {
    if (o.slug && top.slug && top.slug !== o.slug) brand.doc.add("error", ["slug"], `names the brand ${top.slug}, not ${o.slug}`);
    const t = top.theme;
    const named = (slot: string, key: string | null | undefined, type: "color" | "font") => {
      if (key && !rules.some((r) => r.key === key && r.type === type)) brand.doc.add("error", ["theme", slot], `no ${type} rule ${key}`);
    };
    for (const k of COLOR_SLOTS) named(k, t[k], "color");
    for (const k of FONT_SLOTS) named(k, t[k], "font");
    if (t.logo && !rules.some((r) => r.key === t.logo && r.assets.length)) brand.doc.add("error", ["theme", "logo"], `no rule ${t.logo} with a picture`);
    if (!brand.problems.length && !problems.some((p) => p.level === "error")) {
      for (const w of checkWarnings(deriveTheme(rules, t).checks)) brand.doc.add("warning", ["theme"], w);
    }
    problems.push(...brand.doc.problems.filter((p) => !brand.problems.includes(p)).map((p) => ({ ...p, file: brandPath! })));
  }

  const clean = (level: Level) =>
    problems
      .filter((p) => p.level === level)
      .map((p): Problem => ({ file: p.file, ...(p.line !== undefined && { line: p.line }), message: p.message }))
      .sort((a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0));
  const errors = clean("error");
  const ok = !errors.length && top;
  return {
    state: ok ? canonical({ name: top.name, theme: top.theme, rules, pages }) : null,
    errors,
    warnings: clean("warning"),
    missing: [...missing].sort(),
    used,
  };
}

/**
 * Where in the files a problem found beyond them lies: a message from
 * lib/pages.ts about a page ("sections[2].props.collection: no collection"),
 * placed at its line in pages/{slug}.yaml; or a value named in it (an asset
 * id), placed at the first file and line that holds it.
 */
export function locate(files: Files, o: { page?: string; message: string; value?: string }): Problem {
  const all = Object.fromEntries(Object.entries(files).map(([k, v]) => [norm(k), v]));
  if (o.page) {
    const file = [`${PAGES_DIR}${o.page}.yaml`, `${PAGES_DIR}${o.page}.yml`].find((f) => f in all);
    if (file) {
      const d = new Doc(file, all[file]);
      d.addText("error", o.message);
      return { file, line: d.problems.at(-1)?.line, message: o.message };
    }
  }
  if (o.value) {
    for (const [file, text] of Object.entries(all).sort(([a], [b]) => a.localeCompare(b))) {
      const i = text.split("\n").findIndex((l) => l.includes(o.value!));
      if (i >= 0) return { file, line: i + 1, message: o.message };
    }
  }
  return { file: BRAND_FILE, message: o.message };
}

/** Every asset id a state points at: rules, specs, pages, the theme's device. */
export function assetIds(s: BrandState): string[] {
  const out = new Set<string>();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  swapStrings(s, (x) => (uuid.test(x) && out.add(x), x));
  return [...out];
}
