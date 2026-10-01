import { GOOGLE_FAMILY, isFont, standIn } from "./font.ts";
import { fontLabel, fontValue, ruleName, type RuleSpec, type RuleType, type RuleValue } from "./rules.ts";

/**
 * The brandhub's addresses and what it says of a brand, apart from the
 * database (lib/core/hub.ts reads it): `{org}/{brand}` names a brand's latest
 * publish, `{org}/{brand}@3` its third version, for good.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

/** "rust@3": the brand, and the version pinned; null for what no brand is called. */
export function parseRef(raw: string): { slug: string; version?: number } | null {
  let ref: string;
  try {
    ref = decodeURIComponent(raw);
  } catch {
    return null; // a stray %: no brand is called that
  }
  const m = ref.match(/^([a-z0-9][a-z0-9-]*)(?:@([1-9]\d{0,8}))?$/);
  if (!m) return null;
  return m[2] ? { slug: m[1], version: Number(m[2]) } : { slug: m[1] };
}

/** A hub brand's full address, as create_brand's `from` takes it: "rust-lang/rust@12", or the latest without @. */
export const HUB_REF = /^([a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9-]*)(?:@([1-9]\d{0,8}))?$/;
export function parseHubRef(raw: string): { org: string; slug: string; version?: number } | null {
  const m = raw.trim().match(HUB_REF);
  if (!m) return null;
  return m[3] ? { org: m[1], slug: m[2], version: Number(m[3]) } : { org: m[1], slug: m[2] };
}

/**
 * The domain the app's session cookie is set for, when BrandHub's host and
 * APP_URL's share one: hub.example.com and app.example.com give example.com,
 * so someone signed in to the app is signed in on the hub too. Null when
 * the hub has no host of its own, or they share nothing but a suffix too
 * short to be a site's (a single label, or the host itself).
 *
 * ponytail: a public suffix (app.github.io, hub.github.io) is not told apart;
 * browsers refuse such a cookie, so those pairs sign in on the app only.
 */
export function cookieDomain(appUrl: string, hubUrl: string | undefined): string | null {
  if (!hubUrl) return null;
  const labels = (u: string) => new URL(u).hostname.split(".").reverse();
  const a = labels(appUrl);
  const h = labels(hubUrl);
  const shared: string[] = [];
  for (let i = 0; i < Math.min(a.length, h.length) && a[i] === h[i]; i++) shared.push(a[i]);
  if (shared.length < 2 || shared.length === a.length || shared.length === h.length) return null;
  return shared.reverse().join(".");
}

/** A Set-Cookie header without its Domain: for a host the cookie's domain does not cover (an organization's own). */
export const withoutDomain = (setCookie: string) => setCookie.replace(/;\s*domain=[^;]*/i, "");

/** The same cookie for this host alone, expired: it clears a host-only one that would shadow the shared one. */
export const expireHostOnly = (setCookie: string) =>
  `${withoutDomain(setCookie)
    .replace(/^([^=]+)=[^;]*/, "$1=")
    .replace(/;\s*(max-age|expires)=[^;]*/gi, "")}; Max-Age=0`;

/**
 * Where a brand's hub page is: HUB_URL for a public brand; for a private
 * one too when the app's session reaches the hub (cookieDomain), else the
 * app's own /hub, where its people are signed in.
 */
export const hubHome = (visibility: string, appUrl: string, hubUrl: string) =>
  visibility === "public" || cookieDomain(appUrl, hubUrl) ? hubUrl : `${appUrl}/hub`;

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
  /** `kept`: shown, not handed out (lib/rights.ts isDownloadable). */
  assets: { id: string; rendition: string | null; mime: string; filename: string | null; title: string | null; kept?: true }[];
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

/** A card's ground: its color.background, else null (the card washes its tint instead). */
export function backgroundOf(rules: Pick<HubRule, "key" | "type" | "value" | "context">[]) {
  const r = rules.find((x) => x.key === "color.background" && !x.context && x.type === "color" && typeof x.value === "string");
  return (r?.value as string | undefined) ?? null;
}

/** A card's palette band: its colors in order, each with its name, at most `n`. */
export const paletteOf = (rules: (Pick<HubRule, "key" | "type" | "value" | "context"> & { label?: string | null })[], n = 6) =>
  rules.filter((r) => r.type === "color" && !r.context && typeof r.value === "string").slice(0, n).map((r) => ({ hex: r.value as string, name: ruleName(r) }));

/**
 * What a card sets its name in: the family, its weight, and how it loads
 * (`css`, Google Fonts; `src`, its own file), neither when it doesn't load
 * cheaply. `named`: the brand's own family, when `family` is a free one
 * standing in for it, which the card says.
 */
export type CardFace = { family: string; weight: number | null; css: string | null; src: string | null; named: string | null };

/**
 * The face a card sets its name in: the heading typeface (a font rule keyed
 * or marked for headings or display), else the first. It loads from an
 * upright file of its own, through `fileUrl`, else from Google
 * Fonts when the rule says it comes from there, only the glyphs of `text`:
 * a few hundred bytes. Neither: the free look-alike its fallback names
 * (lib/font.ts standIn), from Google the same way; else the card names the family.
 */
export function headingFace<A extends { id: string; mime: string; filename?: string | null }>(
  rules: { key: string; context: string | null; type: RuleType; value: RuleValue; spec?: RuleSpec | null; assets: A[] }[],
  text: string,
  fileUrl: (a: A) => string,
): CardFace | null {
  const fonts = rules.filter((r) => r.type === "font" && !r.context);
  const role = (r: (typeof fonts)[number]) => ((r.spec ?? {}) as { role?: string }).role ?? "";
  const r = fonts.find((f) => /head|display|title/i.test(f.key) || /^(headline|display)$/.test(role(f))) ?? fonts[0];
  if (!r) return null;
  const v = fontValue(r.value);
  // An upright file: a name set in italics would not be the face.
  const file = r.assets.find((a) => isFont(a.mime, a.filename ?? "") && !/italic/i.test(a.filename ?? ""));
  const spec = (r.spec ?? {}) as { source?: string; fallback?: string };
  const google = !file && spec.source === "google" && GOOGLE_FAMILY.test(v.family);
  const stand = !file && !google ? standIn(spec.fallback) : null;
  const drawn = google ? v.family : stand;
  return {
    family: drawn ?? v.family,
    weight: v.weight ?? null,
    css: drawn ? `https://fonts.googleapis.com/css2?family=${drawn.replace(/ +/g, "+")}${v.weight ? `:wght@${v.weight}` : ""}&text=${encodeURIComponent(text)}&display=swap` : null,
    src: file ? fileUrl(file) : null,
    // A fallback that names the family itself (a Google family not marked as one) is no stand-in.
    named: stand && stand !== v.family ? v.family : null,
  };
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
    `- As AdCP brand.json: ${about.url}/brand.json`,
    `- Every rule as JSON: ${about.url}/rules.json`,
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
      if (r.assets.length) {
        const where = (a: A) => (a.kept && !a.rendition && !a.mime.startsWith("image/") ? "shown only, its owner doesn't hand it out" : fileUrl(a));
        lines.push("", "Files:", ...r.assets.map((a) => `- ${a.title ?? a.filename ?? a.mime}: ${where(a)}`));
      }
    }
  }
  return lines.join("\n") + "\n";
}

/** A GitHub account's login, lowercased, as GitHub allows one: null for anything else. */
export function githubLogin(raw: string): string | null {
  const login = raw.trim().replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, "").replace(/\/+$/, "").toLowerCase();
  return /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/.test(login) ? login : null;
}

/**
 * Where a GitHub account proves it is an organization's: a file in its
 * `.github` repository (the one GitHub reads an account's profile and
 * community files from), on its default branch. Only the account's own
 * people can write there.
 */
export const GITHUB_PROOF_FILE = "artbucket-verification.txt";
export const githubProofUrl = (login: string) => `https://raw.githubusercontent.com/${login}/.github/HEAD/${GITHUB_PROOF_FILE}`;

/** How a proved GitHub account is named beside a verified domain: github.com/rust-lang. */
export const githubProof = (login: string) => `github.com/${login}`;

/** The domains a host may prove from above: itself and each name above it, but a bare top-level one. For a query that `provesDomain` (lib/domain-proof.ts) then checks. */
export const domainsAbove = (host: string) => {
  const labels = host.replace(/^www\./, "").split(".");
  return labels.slice(0, -1).map((_, i) => labels.slice(i).join("."));
};

/** Why someone reports a listing: the first is what community listings are most often reported for. */
export const REPORT_REASONS = {
  impersonation: "It pretends to be the brand's owner",
  trademark: "It uses a trademark without permission",
  inaccurate: "Its rules or files are wrong or out of date",
  abuse: "Spam, malware or offensive content",
  other: "Something else",
} as const;
export type ReportReason = keyof typeof REPORT_REASONS;

/** A count as a card shows it: 950, 1.2k, 3.4M. */
export const compact = (n: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n).toLowerCase();
