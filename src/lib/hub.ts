import { inkOn, isHex } from "./color.ts";
import { isFont } from "./font.ts";
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

/** A badge's icon: the image of a logo rule named for a mark, icon or symbol; never a wordmark drawn at 14px. */
export function markOf<A extends { mime: string }>(rules: { key: string; context: string | null; assets: A[] }[]) {
  const r = rules.find((x) => !x.context && x.key.startsWith("logo.") && /(?<!word)mark|icon|symbol/i.test(x.key) && x.assets.some((a) => a.mime.startsWith("image/")));
  return r?.assets.find((a) => a.mime.startsWith("image/")) ?? null;
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
 * What a card sets its name in: the family, its weight, and its own file
 * (`src`), when it has one; else the card names the family.
 */
export type CardFace = { family: string; weight: number | null; src: string | null };

/**
 * The face a card sets its name in: the heading typeface (a font rule keyed
 * or marked for headings or display), else the first. It loads from an
 * upright file of its own, through `fileUrl`; without one, nothing loads.
 */
export function headingFace<A extends { id: string; mime: string; filename?: string | null }>(
  rules: { key: string; context: string | null; type: RuleType; value: RuleValue; spec?: RuleSpec | null; assets: A[] }[],
  fileUrl: (a: A) => string,
): CardFace | null {
  const fonts = rules.filter((r) => r.type === "font" && !r.context);
  const role = (r: (typeof fonts)[number]) => ((r.spec ?? {}) as { role?: string }).role ?? "";
  const r = fonts.find((f) => /head|display|title/i.test(f.key) || /^(headline|display)$/.test(role(f))) ?? fonts[0];
  if (!r) return null;
  const v = fontValue(r.value);
  // An upright file: a name set in italics would not be the face.
  const file = r.assets.find((a) => isFont(a.mime, a.filename ?? "") && !/italic/i.test(a.filename ?? ""));
  return { family: v.family, weight: v.weight ?? null, src: file ? fileUrl(file) : null };
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

/** public/icon.svg's tile and mark, inside a badge. */
const ICON =
  `<rect width="512" height="512" rx="121" fill="#6d4aff"/><g transform="translate(256 256) scale(0.8) translate(-270 -244.5)" fill="#fff">` +
  `<path fill-rule="evenodd" d="M185.5 49 L414 277.5 L263.5 428 A41 41 0 0 1 205.5 428 L84 306.5 A41 41 0 0 1 84 248.5 L204.5 128 L155.5 79 Z M234.5 158 L338.5 262 C326 252 310 246 294 246 C259 246 235 294 200 294 C172 294 148 276 130.5 262 Z"/>` +
  `<path d="M426.5 297 L463.06 364.83 A41.5 41.5 0 1 1 389.94 364.83 Z"/></g>`;

const xml = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * The README badge, "[Acme | @4 ✓]": the brand's mark (a PNG data URI, see
 * markOf) on a white tile, else Artbucket's icon, and the brand's name on
 * Artbucket's ink, the release that is live on the brand's tint, and a
 * check when its organization is verified. 20px high, as shields.io's are,
 * so it sits in a row of them. Widths are guessed from Verdana 11px and
 * `textLength` holds the text to them, so a guess never spills.
 */
export function hubBadge({ name, version, tint, verified, mark = null }: { name: string; version: number; tint: string | null; verified: boolean; mark?: string | null }) {
  const fill = tint && isHex(tint) ? tint.slice(0, 7) : "#6d4aff";
  const ink = inkOn(fill);
  const chars = [...name];
  const label = chars.length > 24 ? `${chars.slice(0, 23).join("")}…` : name;
  const value = `@${version}`;
  const [lw, vw] = [[...label].length * 7, value.length * 7.5];
  const l = 26 + lw + 8;
  const r = 8 + vw + (verified ? 17 : 8);
  const alt = xml(`${name} brand: ${value}${verified ? ", verified" : ""}`);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${l + r}" height="20" role="img" aria-label="${alt}"><title>${alt}</title>` +
    `<linearGradient id="g" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-opacity=".12"/></linearGradient>` +
    `<clipPath id="c"><rect width="${l + r}" height="20" rx="5"/></clipPath>` +
    `<g clip-path="url(#c)"><rect width="${l}" height="20" fill="#20241f"/><rect x="${l}" width="${r}" height="20" fill="${fill}"/><rect width="${l + r}" height="20" fill="url(#g)"/><rect x="${l}" width="1" height="20" fill="#fff" fill-opacity=".2"/></g>` +
    (mark && /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(mark)
      ? `<rect x="6" y="3" width="14" height="14" rx="3.5" fill="#fff"/><image x="7.5" y="4.5" width="11" height="11" href="${mark}"/>`
      : `<svg x="6" y="3" width="14" height="14" viewBox="0 0 512 512">${ICON}</svg>`) +
    `<g font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11" font-weight="bold">` +
    `<text x="26" y="14" fill="#fff" textLength="${lw}" lengthAdjust="spacingAndGlyphs">${xml(label)}</text>` +
    `<text x="${l + 8}" y="14" fill="${ink}" textLength="${vw}" lengthAdjust="spacingAndGlyphs">${value}</text></g>` +
    (verified ? `<path d="M${l + r - 14} 10.5l2.5 2.5 4.5-5" fill="none" stroke="${ink}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>` : "") +
    `</svg>`
  );
}
