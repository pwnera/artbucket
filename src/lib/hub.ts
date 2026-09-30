import { fontLabel, fontValue, ruleName, type RuleType, type RuleValue } from "./rules.ts";

/**
 * The brandhub's addresses and what it says of a brand, apart from the
 * database (lib/core/hub.ts reads it): `{org}/{brand}` names a brand's latest
 * publish, `{org}/{brand}@3` its third version, for good.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

/** "rust@3": the brand, and the version pinned; null for what no brand is called. */
export function parseRef(raw: string): { slug: string; version?: number } | null {
  const m = decodeURIComponent(raw).match(/^([a-z0-9][a-z0-9-]*)(?:@([1-9]\d{0,8}))?$/);
  if (!m) return null;
  return m[2] ? { slug: m[1], version: Number(m[2]) } : { slug: m[1] };
}

/** A listing's path on the hub, from its root. */
export const hubPath = (org: string, brand: string, version?: number | null) => `/${org}/${brand}${version ? `@${version}` : ""}`;

/** What a hub reader gets of a rule: the portal's shape (lib/core/portals.ts viewPortalBrand), less what only pages need. */
export type HubRule = {
  key: string;
  label: string | null;
  context: string | null;
  type: RuleType;
  value: RuleValue;
  usage: string | null;
  assets: { id: string; rendition: string | null; mime: string; filename: string | null; title: string | null }[];
};

/** A card's look: the brand's colors in order, at most `n`. */
export const swatches = (rules: Pick<HubRule, "type" | "value" | "context">[], n = 5) =>
  rules.filter((r) => r.type === "color" && !r.context && typeof r.value === "string").slice(0, n).map((r) => r.value as string);

/** The image a card shows: the mark (a logo rule named for one), else the first logo rule's image, else any rule's. */
export function logoOf<A extends { mime: string }>(rules: { key: string; context: string | null; assets: A[] }[]) {
  const image = (r: { assets: A[] }) => r.assets.find((a) => a.mime.startsWith("image/"));
  const own = rules.filter((r) => !r.context);
  const logos = own.filter((r) => r.key.startsWith("logo."));
  const ordered = [...logos.filter((r) => /mark|icon|symbol/i.test(r.key)), ...logos, ...own];
  for (const r of ordered) {
    const a = image(r);
    if (a) return a;
  }
  return null;
}

/** The color a card is tinted with: color.primary, else the first color. */
export function tintOf(rules: Pick<HubRule, "key" | "type" | "value" | "context">[]) {
  const colors = rules.filter((r) => r.type === "color" && !r.context && typeof r.value === "string");
  return ((colors.find((r) => r.key === "color.primary") ?? colors[0])?.value as string | undefined) ?? null;
}

/** Markdown marks off, one line. */
const plain = (md: string) => md.replace(/[*_`#>]+/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();

/** A card's one line: the tagline, else the mission, else the voice, cut at a sentence or `max` characters. */
export function taglineOf(rules: Pick<HubRule, "key" | "type" | "value" | "context">[], max = 90) {
  for (const key of ["brand.tagline", "brand.slogan", "brand.mission", "brand.promise", "tone.voice"]) {
    const r = rules.find((x) => x.key === key && !x.context && x.type === "text" && typeof x.value === "string");
    if (!r) continue;
    const line = plain(r.value as string);
    const first = line.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? line;
    return first.length > max ? `${first.slice(0, max - 1).trimEnd()}…` : first;
  }
  return null;
}

/** What a brand holds, for a card's footer: colors, typefaces by family, logos with a picture. */
export function countsOf(rules: (Pick<HubRule, "key" | "type" | "value" | "context"> & { assets: { mime: string }[] })[]) {
  const own = rules.filter((r) => !r.context);
  const families = [...new Set(own.filter((r) => r.type === "font").map((r) => fontValue(r.value).family))];
  return {
    colors: own.filter((r) => r.type === "color").length,
    families,
    logos: own.filter((r) => r.key.startsWith("logo.") && r.assets.some((a) => a.mime.startsWith("image/"))).length,
  };
}

/** "3 days ago", in English, from `now`. */
export function ago(when: Date | string, now = new Date()) {
  const s = Math.round((new Date(when).getTime() - now.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, n] of [["year", 31_536_000], ["month", 2_592_000], ["week", 604_800], ["day", 86_400], ["hour", 3600], ["minute", 60]] as const) {
    if (Math.abs(s) >= n) return rtf.format(Math.trunc(s / n), unit);
  }
  return "just now";
}

const valueText = (r: Pick<HubRule, "type" | "value">) => {
  if (r.type === "font") return fontLabel(fontValue(r.value));
  if (Array.isArray(r.value)) return r.value.map((v) => `- ${v}`).join("\n");
  return String(r.value);
};

type About = { name: string; owner: string; verified: string | null; version: number | null; url: string; guidelines: string; terms: string | null };

/**
 * The brand as llms.txt (llmstxt.org): what an agent reads before making
 * anything in it. Every rule, default context first, its files as URLs.
 */
export function brandText<A extends HubRule["assets"][number]>(about: About, rules: (Omit<HubRule, "assets"> & { assets: A[] })[], fileUrl: (a: A) => string) {
  const by = about.verified ? `${about.owner} (verified: ${about.verified})` : `${about.owner} (community listing, not verified as the brand's owner)`;
  const lines = [
    `# ${about.name}`,
    "",
    `> ${about.name}'s brand rules from the Artbucket BrandHub, listed by ${by}.${about.version ? ` Version ${about.version}.` : ""}`,
    "",
    `- Listing: ${about.url}`,
    `- Guidelines for people: ${about.guidelines}`,
    `- As JSON: ${about.url}/brand.json`,
    `- As design tokens: ${about.url}/tokens?format=css (or scss, less, tailwind, tailwind3, ts, shadcn, mui, chakra, json for W3C design tokens)`,
  ];
  if (about.terms) lines.push("", "## Terms of use", "", about.terms);
  const contexts = [null, ...new Set(rules.flatMap((r) => r.context ?? []))];
  for (const c of contexts) {
    const here = rules.filter((r) => r.context === c);
    if (!here.length) continue;
    lines.push("", c ? `## Rules in ${c}` : "## Rules");
    for (const r of here) {
      lines.push("", `### ${ruleName(r)} (\`${r.key}\`, ${r.type})`, "", valueText(r));
      if (r.usage) lines.push("", r.usage);
      if (r.assets.length) lines.push("", "Files:", ...r.assets.map((a) => `- ${a.title ?? a.filename ?? a.mime}: ${fileUrl(a)}`));
    }
  }
  return lines.join("\n") + "\n";
}
