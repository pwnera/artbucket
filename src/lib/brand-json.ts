import type { z } from "zod";
import { brandDomain } from "./portal.ts";
import { fontValue, RULE_CONTEXT, RULE_KEY, RuleInput, ruleLabel, type RuleType, type RuleValue } from "./rules.ts";

/**
 * A published brand as an AdCP brand.json (docs.adcontextprotocol.org, the
 * Brand Canonical Document variant): the open format agents look for at a
 * domain's /.well-known/brand.json. What it has no field for (print colors,
 * contexts, every other rule) stays in the files `ext.artbucket` links.
 *
 * Pure, like lib/hub.ts: `pnpm test` runs it under plain Node.
 */

type Asset = { url: string; mime: string; title: string | null; filename: string | null; width?: number | null; height?: number | null };
export type BrandJsonRule = {
  key: string;
  label: string | null;
  context: string | null;
  type: RuleType;
  value: RuleValue;
  spec?: Record<string, unknown> | null;
  usage: string | null;
  assets: Asset[];
};
export type BrandJsonInput = {
  slug: string;
  name: string;
  version: number;
  publishedAt: Date | string;
  /** The org's proof: a domain (acme.com), or a GitHub account (github.com/acme), which is no house. */
  verified: string | null;
  /** The brand's own domain (brands.domain), its `url` before the org's. */
  domain?: string | null;
  rules: BrandJsonRule[];
  /** The listing's own files: the lossless ones brand.json points at. */
  links: Record<string, string>;
};

const tail = (key: string) => key.split(".").slice(1).join(".");
/** `color.darkBlue` is `dark_blue`: AdCP's keys are snake case. */
const snake = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase();
const text = (v: RuleValue) => (Array.isArray(v) ? v.map(String) : [String(v)]);
const HEX6 = /^#[0-9a-f]{6}/i;
const DONT = /^(never|neverDo|dont|donts|avoid|misuse)$/;
const DO = /^(always|do|dos)$/;

/** The first rule of the default context whose key is one of `keys`, in that order. */
const pick = (rules: BrandJsonRule[], keys: string[], type?: RuleType) =>
  keys.map((k) => rules.find((r) => r.key === k && (!type || r.type === type))).find(Boolean);

function logoOf(r: BrandJsonRule, a: Asset, n: number) {
  const t = tail(r.key);
  // Wordmark before mark: "wordmark" holds "mark", and a wordmark is no icon.
  const variant = t === "primary" ? "primary" : /wordmark/i.test(t) ? "wordmark" : /lockup/i.test(t) ? "full-lockup" : /mark|icon|symbol/i.test(t) ? "icon" : "secondary";
  const dark = /dark/.test(r.context ?? "") || /reversed|inverse|white|dark/i.test(t);
  const w = a.width ?? 0;
  const h = a.height ?? 0;
  // The key says what the art can't: a "vertical" lockup is its parts stacked, however wide the file.
  const orientation = /stack|vertical/i.test(t) ? "stacked" : !w || !h ? undefined : w / h > 1.25 ? "horizontal" : h / w > 1.25 ? "vertical" : "square";
  return {
    id: snake([t, r.context, n > 0 && n + 1].filter(Boolean).join("_")),
    url: a.url,
    variant,
    ...(orientation && { orientation }),
    ...(dark && { background: "dark-bg" }),
    ...(variant === "icon" && !r.context && { slots: ["favicon", "app_icon", "profile_mark"] }),
    ...(w && h && { width: w, height: h }),
    ...(r.usage && { usage: r.usage }),
    tags: [r.key, ...(r.context ? [r.context] : [])],
  };
}

const ROLES: Record<string, string> = { display: "heading", headline: "heading", subhead: "subheading", body: "body", caption: "caption", button: "cta" };
const CASE: Record<string, string> = { none: "none", upper: "uppercase", lower: "lowercase", title: "capitalize" };

/** A size with its unit: 1 x of the mark's height reads "1x the mark's height". */
const measure = (r: BrandJsonRule) => {
  if (r.type !== "number") return text(r.value).join(" ");
  const { unit = "px", of } = (r.spec ?? {}) as { unit?: string; of?: string };
  return `${r.value}${unit}${of ? ` ${of}` : ""}`;
};

export function brandJson(b: BrandJsonInput) {
  const own = b.rules.filter((r) => !r.context);
  const colors = own.filter((r) => r.type === "color" && typeof r.value === "string" && r.key.startsWith("color."));
  const hex = (key: string) => (colors.find((r) => r.key === key)?.value as string | undefined)?.slice(0, 7);

  // Every color by its name, then AdCP's five roles from the names brands use for them.
  const palette: Record<string, string> = {};
  for (const r of colors) palette[snake(tail(r.key))] ??= (r.value as string).slice(0, 7);
  for (const [role, keys] of Object.entries({ background: ["color.background", "color.paper", "color.white"], text: ["color.ink", "color.text", "color.black"] })) {
    const r = pick(colors, keys);
    if (r && !palette[role]) palette[role] = (r.value as string).slice(0, 7);
  }
  const colorways = colors.flatMap((r) => {
    const pair = (r.spec as { pair?: string } | null)?.pair;
    const fg = pair && hex(pair);
    return fg && HEX6.test(fg) ? [{ name: `${snake(tail(pair))}_on_${snake(tail(r.key))}`, foreground: fg, background: (r.value as string).slice(0, 7) }] : [];
  });

  const faces = own.filter((r) => r.type === "font" && r.key.startsWith("type."));
  const fonts: Record<string, object> = {};
  const scale: Record<string, object> = {};
  for (const r of faces) {
    const v = fontValue(r.value);
    const s = (r.spec ?? {}) as { role?: string; features?: string[]; fallback?: string; lineHeight?: number; tracking?: unknown; case?: string };
    const name = snake(tail(r.key));
    const files = r.assets.filter((a) => a.mime.startsWith("font/")).map((a) => ({ url: a.url }));
    fonts[name] = {
      family: v.family,
      ...(files.length && { files }),
      ...(s.features?.length && { opentype_features: s.features }),
      ...(s.fallback && { fallbacks: s.fallback.split(",").map((f) => f.trim()).filter(Boolean) }),
    };
    const role = ROLES[s.role ?? ""] ?? (["heading", "subheading", "body", "caption", "cta"].includes(name) ? name : null);
    if (role && !scale[role] && (v.size || v.weight)) {
      scale[role] = {
        font: name,
        ...(v.size && { size: `${v.size}px` }),
        ...(v.weight && { weight: String(v.weight) }),
        ...(s.lineHeight && { line_height: String(s.lineHeight) }),
        ...(typeof s.tracking === "number" && { letter_spacing: `${s.tracking}em` }),
        ...(s.case && CASE[s.case] && { text_transform: CASE[s.case] }),
      };
    }
  }
  const primary = pick(faces, ["type.heading", "type.display", "type.primary", "type.headline"]);
  const secondary = pick(faces, ["type.body", "type.text", "type.sans", "type.secondary"]);
  if (primary && !fonts.primary) fonts.primary = fonts[snake(tail(primary.key))];
  if (secondary && secondary !== primary && !fonts.secondary) fonts.secondary = fonts[snake(tail(secondary.key))];

  // A logo rule's images, in context too (a dark-background version is a dark-bg logo); never a don't's examples.
  const logoRules = b.rules.filter((r) => r.key.startsWith("logo.") && !DONT.test(tail(r.key)) && !DO.test(tail(r.key)));
  const logos = logoRules.flatMap((r) => r.assets.filter((a) => a.mime.startsWith("image/")).map((a, i) => logoOf(r, a, i)));

  const list = (keys: string[]) => own.filter((r) => keys.includes(r.key)).flatMap((r) => text(r.value));
  const restrictions = own.filter((r) => r.type === "list" && /^(color|logo|imagery|type)\./.test(r.key) && DONT.test(tail(r.key))).flatMap((r) => text(r.value));
  const size = pick(own, ["logo.minSize", "logo.minHeight"]);
  const space = pick(own, ["logo.clearSpace", "logo.minClearSpace", "logo.margin"]);
  const spacing = pick(own, ["space.scale", "spacing.scale"], "list");

  const voice = pick(own, ["tone.voice", "voice.voice"], "text");
  const tone = {
    ...(voice && { voice: String(voice.value) }),
    ...(list(["tone.attributes", "tone.pillars", "tone.traits"]).length && { attributes: list(["tone.attributes", "tone.pillars", "tone.traits"]) }),
    ...(list(["tone.always", "tone.do", "tone.dos"]).length && { dos: list(["tone.always", "tone.do", "tone.dos"]) }),
    ...(list(["tone.avoid", "tone.never", "tone.dont", "tone.donts"]).length && { donts: list(["tone.avoid", "tone.never", "tone.dont", "tone.donts"]) }),
  };
  const visual = {
    ...((size || space) && {
      logo_placement: { ...(space && { min_clear_space: measure(space) }), ...(size && { min_height: measure(size) }) },
    }),
    ...(colorways.length && { colorways }),
    ...(Object.keys(scale).length && { type_scale: scale }),
    ...(spacing && {
      spacing: { scale: Object.fromEntries(text(spacing.value).slice(0, 6).map((v, i) => [["xs", "sm", "md", "lg", "xl", "2xl"][i], /^\d+(\.\d+)?$/.test(v) ? `${v}px` : v])) },
    }),
    ...(restrictions.length && { restrictions }),
  };
  const images = own
    .filter((r) => r.key.startsWith("imagery."))
    .flatMap((r) =>
      r.assets
        .filter((a) => a.mime.startsWith("image/"))
        .map((a, i) => ({
          asset_id: snake([tail(r.key), i > 0 && i + 1].filter(Boolean).join("_")),
          asset_type: "image",
          url: a.url,
          name: a.title ?? a.filename ?? tail(r.key),
          ...(r.usage && { description: r.usage }),
          ...(a.width && a.height && { width: a.width, height: a.height }),
          format: a.mime.split("/")[1].replace("+xml", ""),
          tags: [r.key],
        })),
    );
  const tagline = pick(own, ["brand.tagline", "brand.slogan"], "text");
  const description = pick(own, ["brand.description", "brand.mission", "brand.promise"], "text");
  const industries = list(["brand.industries"]);
  const disclaimers = own.filter((r) => r.key === "legal.disclaimer" && r.type === "text").map((r) => ({ text: String(r.value) }));
  const domain = b.verified && !b.verified.includes("/") ? b.verified : null;

  return {
    $schema: "https://adcontextprotocol.org/schemas/v3/brand.json",
    version: String(b.version),
    ...(domain && { house_domain: domain }),
    id: b.slug.replace(/-/g, "_"),
    names: [{ en: b.name }],
    ...((b.domain || domain) && { url: `https://${b.domain || domain}` }),
    ...(description && { description: String(description.value) }),
    ...(tagline && { tagline: String(tagline.value) }),
    ...(industries.length && { industries }),
    ...(logos.length && { logos }),
    ...(Object.keys(palette).length && { colors: palette }),
    ...(Object.keys(fonts).length && { fonts }),
    ...(Object.keys(tone).length && { tone }),
    ...(Object.keys(visual).length && { visual_guidelines: visual }),
    ...(images.length && { assets: images }),
    ...(disclaimers.length && { disclaimers }),
    last_updated: new Date(b.publishedAt).toISOString(),
    ext: { artbucket: { release: b.version, ...b.links } },
  };
}

// ---- the way back: an AdCP brand.json in, the canon out -----------------------------------

/** A file a brand made from a document ingests: where it is, a filename, and the title the document gives it. */
export type BrandJsonFile = { url: string; filename: string; title?: string };

/**
 * One brand of a document, as a new brand takes it: rules as set_rules takes
 * them, whose assets are placeholders, the keys of `files`, swapped for the
 * ingested files' ids. `dropped` names what the canon has no place for, by
 * its path in the document.
 */
export type ImportedBrand = {
  /** AdCP's id: which brand of a House Portfolio. */
  id: string;
  name: string;
  slug: string;
  /** Lower-cased, no www: its `url`, else its primary website, else its house's or the domain it was read from. */
  domain: string | null;
  rules: z.input<typeof RuleInput>[];
  files: Record<string, BrandJsonFile>;
  dropped: string[];
};

/**
 * What a document gives: its brands, and where to read on. An Authoritative
 * Location Redirect is only `location`; a House Portfolio's children that
 * publish their own document are `refs`, at their domains. `none` says why a
 * document gives no brand (a House Redirect, a brand agent, not brand.json).
 */
export type BrandJsonRead = { brands: ImportedBrand[]; refs: { domain: string; id: string }[]; location?: string; none?: string };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const isList = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.every(isStr);
const strings = (v: unknown) => (Array.isArray(v) ? v.filter(isStr) : []);
const https = (v: unknown): v is string => isStr(v) && /^https:\/\/[^\s/]+/i.test(v);
/** `dark_blue` is `darkBlue`, `surface_1` `surface1`: a rule key's camel case. */
const camel = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : ""));
const fileName = (url: string) => decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() ?? "") || "file";
const tag = (t: string) => t.replace(/_/g, "-").toLowerCase();

/**
 * A localized field as AdCP 3.2 resolves it (brand-json.mdx, "Document
 * language and localized fields"): the language asked for, its base
 * language, the document's default_language, its base, then the plain value;
 * else nothing, never the first translation there happens to be. Legacy
 * underscore tags (fr_CA) read as fr-CA. A localized list is one whole value.
 */
export function localized<T>(v: unknown, lang: string, fallback: string, plain: (x: unknown) => x is T): T | undefined {
  if (plain(v)) return v;
  if (!Array.isArray(v)) return undefined;
  const maps = v.filter((m): m is Obj => isObj(m) && Object.keys(m).length === 1);
  for (const want of [lang, lang.split(/[-_]/)[0], fallback, fallback.split(/[-_]/)[0]].map(tag)) {
    const hit = maps.find((m) => tag(Object.keys(m)[0]) === want);
    if (hit && plain(Object.values(hit)[0])) return Object.values(hit)[0] as T;
  }
  return undefined;
}

const MEASURE = new RegExp(`^\\s*(-?\\d+(?:\\.\\d+)?)\\s*(${["px", "pt", "mm", "cm", "in", "%", "em", "rem", "x", "ms"].join("|")})?\\s*(.*)$`);
/** "1x the mark's height" as a number rule: the way back from `measure`. */
function measured(key: string, s: string): Draft {
  const m = s.match(MEASURE);
  if (!m) return { key, type: "text", value: s };
  const [, n, unit, of] = m;
  return { key, type: "number", value: Number(n), spec: { ...(unit && { unit }), ...(of && { of: of.slice(0, 80) }) } };
}

const VARIANTS: Record<string, string> = { primary: "logo.primary", secondary: "logo.secondary", icon: "logo.mark", wordmark: "logo.wordmark", "full-lockup": "logo.lockup" };
const SCALE_ROLES: Record<string, "headline" | "subhead" | "body" | "caption" | "button"> = { heading: "headline", subheading: "subhead", body: "body", caption: "caption", cta: "button" };
const CASES: Record<string, "none" | "upper" | "lower" | "title"> = { none: "none", uppercase: "upper", lowercase: "lower", capitalize: "title" };
const SPACING = ["xs", "sm", "md", "lg", "xl", "2xl"];
/** What a brand says that the canon keeps: the rest is dropped, and named. */
const KEPT = new Set(["$schema", "version", "last_updated", "default_language", "id", "names", "url", "properties", "description", "tagline", "industries", "target_audience", "logos", "colors", "fonts", "tone", "assets", "disclaimers", "visual_guidelines", "ext"]);
const KEPT_VISUAL = new Set(["logo_placement", "colorways", "type_scale", "spacing", "restrictions"]);

/** A primary website's host, or the first website's. */
const website = (props: unknown) => {
  const sites = (Array.isArray(props) ? props : []).filter((p): p is Obj => isObj(p) && p.type === "website" && isStr(p.identifier));
  const site = sites.find((p) => p.primary) ?? sites[0];
  return site ? brandDomain(site.identifier as string) : null;
};

/**
 * An AdCP brand.json in (docs/brand-json-mapping.md run backwards): the
 * brands it holds as the canon has them, or where to read on. Pure, like the
 * export: the caller fetches, follows `location` and `refs`, and ingests the
 * files. What our own export writes comes back as it was, as far as the
 * export said it (a logo's `tags` name its rule and context).
 *
 * `domain` is where the document was read; `language` the language asked
 * for, English as the core has no locales.
 */
export function fromBrandJson(doc: unknown, { domain = null, language = "en" }: { domain?: string | null; language?: string } = {}): BrandJsonRead {
  if (!isObj(doc)) return { brands: [], refs: [], none: "Not a brand.json: not a JSON object" };
  if (isStr(doc.authoritative_location)) return { brands: [], refs: [], location: doc.authoritative_location };
  if (isStr(doc.house)) return { brands: [], refs: [], none: `It points at its house, ${doc.house}: read that domain's brand.json` };
  const fallback = isStr(doc.default_language) ? doc.default_language : "en";
  if (isObj(doc.house) || Array.isArray(doc.brands) || Array.isArray(doc.brand_refs)) {
    const house = isObj(doc.house) ? brandDomain(String(doc.house.domain ?? "")) : null;
    const refs = (Array.isArray(doc.brand_refs) ? doc.brand_refs : []).flatMap((r) => {
      const d = isObj(r) && isStr(r.domain) ? brandDomain(r.domain) : null;
      return d ? [{ domain: d, id: isStr(r.brand_id) ? r.brand_id : d }] : [];
    });
    const brands = (Array.isArray(doc.brands) ? doc.brands : []).filter(isObj).map((b) => brandOf(b, { domain: house ?? domain, language, fallback }));
    return { brands, refs };
  }
  if (!Array.isArray(doc.names) && !isStr(doc.id)) return { brands: [], refs: [], none: isObj(doc.brand_agent) || Array.isArray(doc.agents) ? "A brand agent answers for this brand, over MCP: there is no document to read" : "Not a brand.json: no brand in it" };
  return { brands: [brandOf(doc, { domain, language, fallback })], refs: [] };
}

type Draft = { key: string; context?: string | null; type: string; value: unknown; label?: string | null; usage?: string | null; spec?: Obj | null; assets?: string[] };

function brandOf(b: Obj, { domain, language, fallback }: { domain: string | null; language: string; fallback: string }): ImportedBrand {
  const dropped = Object.keys(b).filter((k) => !KEPT.has(k));
  const loc = <T>(v: unknown, plain: (x: unknown) => x is T) => localized(v, language, fallback, plain);
  const drafts = new Map<string, Draft>();
  const put = (d: Draft) => drafts.set(`${d.key}|${d.context ?? ""}`, d);
  const files: Record<string, BrandJsonFile> = {};
  const byUrl = new Map<string, string>();
  /** A placeholder id for a file: one per URL. */
  const file = (url: string, title?: string) => {
    let id = byUrl.get(url);
    if (!id) {
      id = `00000000-0000-4000-8000-${String(byUrl.size + 1).padStart(12, "0")}`;
      byUrl.set(url, id);
      files[id] = { url, filename: fileName(url), ...(title && { title }) };
    }
    return id;
  };

  // Identity. Names are the legacy alias list, outside 3.2's rule: a brand needs a name, so its first when none is in a language asked for.
  const names = Array.isArray(b.names) ? b.names.filter(isObj) : [];
  const name = (loc(names, isStr) ?? names.map((n) => Object.values(n)[0]).find(isStr) ?? (isStr(b.id) ? b.id : "Brand")).trim().slice(0, 80);
  const id = isStr(b.id) ? b.id : name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "brand";
  const slug = id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "brand";
  if (isStr(b.description)) put({ key: "brand.description", type: "text", value: b.description });
  const tagline = loc(b.tagline, isStr);
  if (tagline) put({ key: "brand.tagline", type: "text", value: tagline });
  if (isList(b.industries)) put({ key: "brand.industries", type: "list", value: b.industries });
  if (isStr(b.target_audience)) put({ key: "brand.audience", type: "text", value: b.target_audience });

  // Colors by name; background and text are roles the export fills from other names, kept when they add a color.
  const colors = isObj(b.colors) ? b.colors : {};
  const hexOf = new Map<string, string>();
  for (const pass of [false, true]) {
    for (const [role, v] of Object.entries(colors)) {
      if ((role === "background" || role === "text") !== pass) continue;
      const hexes = (Array.isArray(v) ? v : [v]).filter((h): h is string => typeof h === "string" && /^#[0-9a-f]{6}$/i.test(h)).map((h) => h.toLowerCase());
      if (!hexes.length) dropped.push(`colors.${role}`);
      hexes.forEach((hex, i) => {
        if (pass && i === 0 && [...hexOf.values()].includes(hex)) return;
        const key = `color.${camel(role)}${i ? i + 1 : ""}`;
        hexOf.set(key, hex);
        put({ key, type: "color", value: hex });
      });
    }
  }
  const visual = isObj(b.visual_guidelines) ? b.visual_guidelines : {};
  dropped.push(...Object.keys(visual).filter((k) => !KEPT_VISUAL.has(k)).map((k) => `visual_guidelines.${k}`));
  (Array.isArray(visual.colorways) ? visual.colorways : []).forEach((w, i) => {
    if (!isObj(w)) return;
    const [fg, bg] = [String(w.foreground ?? "").toLowerCase(), String(w.background ?? "").toLowerCase()];
    // Our export names a pair `{pair}_on_{color}`; anyone else's is matched by its hexes.
    const named = String(w.name ?? "").match(/^(.+)_on_(.+)$/);
    const keyed = named && [`color.${camel(named[1])}`, `color.${camel(named[2])}`];
    const [f, g] =
      keyed && hexOf.get(keyed[0]) === fg && hexOf.get(keyed[1]) === bg
        ? keyed
        : [[...hexOf].find(([, h]) => h === fg)?.[0], [...hexOf].find(([, h]) => h === bg)?.[0]];
    const ground = g && drafts.get(`${g}|`);
    if (!f || !ground || f === g || ground.spec?.pair) return void dropped.push(`visual_guidelines.colorways[${i}]`);
    ground.spec = { ...ground.spec, pair: f };
  });

  // Faces by role; primary and secondary are the export's aliases of another role, kept when they add a face.
  const fonts = isObj(b.fonts) ? b.fonts : {};
  const faceKey = new Map<string, string>();
  const seen = new Map<string, string>();
  for (const pass of [false, true]) {
    for (const [role, raw] of Object.entries(fonts)) {
      if ((role === "primary" || role === "secondary") !== pass) continue;
      const f = typeof raw === "string" ? { family: raw } : isObj(raw) ? raw : null;
      const stack = isStr(f?.family) ? f.family.split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean) : [];
      if (!f || !stack.length) {
        dropped.push(`fonts.${role}`);
        continue;
      }
      const fallbacks = [...stack.slice(1), ...strings(f.fallbacks)];
      const face = {
        family: stack[0],
        features: strings(f.opentype_features),
        fallback: fallbacks.join(", "),
        files: (Array.isArray(f.files) ? f.files : []).flatMap((x) => (isObj(x) && https(x.url) ? [file(x.url)] : [])),
      };
      const sig = JSON.stringify(face);
      const twin = seen.get(sig);
      if (pass && twin) {
        faceKey.set(role, twin);
        continue;
      }
      const key = `type.${camel(role)}`;
      seen.set(sig, key);
      faceKey.set(role, key);
      put({
        key,
        type: "font",
        value: { family: face.family },
        spec: { ...(face.features.length && { features: face.features }), ...(face.fallback && { fallback: face.fallback }) },
        ...(face.files.length && { assets: face.files }),
      });
    }
  }
  for (const [role, e] of Object.entries(isObj(visual.type_scale) ? visual.type_scale : {})) {
    const key = isObj(e) && isStr(e.font) ? faceKey.get(e.font) : undefined;
    const face = key && drafts.get(`${key}|`);
    if (!isObj(e) || !face || face.spec?.role || !SCALE_ROLES[role]) {
      dropped.push(`visual_guidelines.type_scale.${role}`);
      continue;
    }
    const px = String(e.size ?? "").match(/^(\d+(?:\.\d+)?)px$/)?.[1];
    const weight = { normal: 400, bold: 700 }[String(e.weight)] ?? (/^\d{3}$/.test(String(e.weight ?? "")) ? Number(e.weight) : undefined);
    const lineHeight = /^\d+(\.\d+)?$/.test(String(e.line_height ?? "")) ? Number(e.line_height) : undefined;
    const tracking = String(e.letter_spacing ?? "").match(/^(-?\d*\.?\d+)em$/)?.[1];
    face.value = { ...(face.value as Obj), ...(px && { size: Number(px) }), ...(weight && { weight }) };
    face.spec = {
      ...face.spec,
      role: SCALE_ROLES[role],
      ...(lineHeight && { lineHeight }),
      ...(tracking && { tracking: Number(tracking) }),
      ...(isStr(e.text_transform) && CASES[e.text_transform] && { case: CASES[e.text_transform] }),
    };
  }

  // Logos: our export tags each with its rule's key and context; anyone else's by variant and background.
  (Array.isArray(b.logos) ? b.logos : []).forEach((l, i) => {
    if (!isObj(l) || !https(l.url)) return void dropped.push(`logos[${i}]`);
    const tags = strings(l.tags);
    const own = tags[0]?.startsWith("logo.") && RULE_KEY.test(tags[0]);
    const variant = isStr(l.variant) && VARIANTS[l.variant] ? l.variant : (tags.find((t) => VARIANTS[t]) ?? "primary");
    const dark = l.background === "dark-bg" || tags.includes("dark-bg") || l.theme === "dark";
    const key = own ? tags[0] : VARIANTS[variant];
    const context = own ? (tags[1] && RULE_CONTEXT.test(tags[1]) ? tags[1] : null) : dark ? "dark-background" : null;
    const at = drafts.get(`${key}|${context ?? ""}`);
    const id = file(l.url);
    if (at) at.assets = [...new Set([...(at.assets ?? []), id])];
    else put({ key, context, type: "text", value: isStr(l.usage) ? l.usage : ruleLabel(key), usage: isStr(l.usage) ? l.usage : null, assets: [id] });
  });
  const place = isObj(visual.logo_placement) ? visual.logo_placement : {};
  if (isStr(place.min_height)) put(measured("logo.minSize", place.min_height));
  if (isStr(place.min_clear_space)) put(measured("logo.clearSpace", place.min_clear_space));
  dropped.push(...Object.keys(place).filter((k) => k !== "min_height" && k !== "min_clear_space").map((k) => `visual_guidelines.logo_placement.${k}`));
  // AdCP's restrictions are the export's don'ts of every section, as one list: they come back as the logo's.
  if (isList(visual.restrictions)) put({ key: "logo.never", type: "list", value: visual.restrictions.slice(0, 100).map((s) => s.slice(0, 500)) });

  // Voice: the export's keys, each list one whole value in the language asked for.
  const tone = isStr(b.tone) ? { voice: b.tone } : isObj(b.tone) ? b.tone : {};
  const voice = loc(tone.voice, isStr);
  if (voice) put({ key: "tone.voice", type: "text", value: voice });
  for (const [field, key] of [["attributes", "tone.attributes"], ["dos", "tone.always"], ["donts", "tone.avoid"]]) {
    const list = loc(tone[field], isList);
    if (list) put({ key, type: "list", value: list });
    else if (tone[field] !== undefined) dropped.push(`tone.${field}`);
  }

  const spacing = isObj(visual.spacing) && isObj(visual.spacing.scale) ? visual.spacing.scale : {};
  const steps = SPACING.flatMap((s) => (isStr(spacing[s]) ? [/^\d+(\.\d+)?px$/.test(spacing[s]) ? Number.parseFloat(spacing[s]) : spacing[s]] : []));
  if (steps.length) put({ key: "space.scale", type: "list", value: steps });

  // Images, grouped by the imagery rule our export tags them with; the rest of the library as one.
  (Array.isArray(b.assets) ? b.assets : []).forEach((a, i) => {
    if (!isObj(a) || a.asset_type !== "image" || !https(a.url)) return void dropped.push(`assets[${i}]`);
    const tags = strings(a.tags);
    const key = tags[0]?.startsWith("imagery.") && RULE_KEY.test(tags[0]) ? tags[0] : "imagery.library";
    const title = loc(a.name, isStr);
    const about = loc(a.description, isStr);
    const id = file(a.url, title);
    const at = drafts.get(`${key}|`);
    if (at) at.assets = [...new Set([...(at.assets ?? []), id])];
    else put({ key, type: "text", value: about ?? title ?? ruleLabel(key), usage: about ?? null, assets: [id] });
  });
  const disclaimers = (Array.isArray(b.disclaimers) ? b.disclaimers : []).flatMap((d) => (isObj(d) && isStr(d.text) ? [d.text] : []));
  if (disclaimers.length) put({ key: "legal.disclaimer", type: "text", value: disclaimers.join("\n\n") });

  // What doesn't fit a rule (a key the canon refuses, a list too long) is dropped, and named, rather than refusing the brand.
  const rules = [...drafts.values()].flatMap(({ spec, assets, ...d }) => {
    const input = Object.fromEntries(
      Object.entries({ ...d, spec: spec && Object.keys(spec).length ? spec : null, assets: assets?.slice(0, 24) }).filter(([, v]) => v !== undefined && v !== null),
    ) as z.input<typeof RuleInput>;
    if (RuleInput.safeParse(input).success) return [input];
    dropped.push(d.key);
    return [];
  });
  const used = new Set(rules.flatMap((r) => (r.assets ?? []).map(String)));
  return {
    id,
    name,
    slug,
    domain: (isStr(b.url) && brandDomain(b.url)) || website(b.properties) || domain,
    rules,
    files: Object.fromEntries(Object.entries(files).filter(([k]) => used.has(k))),
    dropped,
  };
}
