import { fontValue, type RuleType, type RuleValue } from "./rules.ts";

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
  const variant = t === "primary" ? "primary" : /mark|icon|symbol/i.test(t) ? "icon" : t === "wordmark" ? "wordmark" : /lockup/i.test(t) ? "full-lockup" : "secondary";
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
    ...(domain && { url: `https://${domain}` }),
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
