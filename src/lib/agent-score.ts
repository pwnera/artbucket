import { readiness, WEIGHTS } from "./readiness.ts";

/**
 * The public Brand Agent Score (PRD, hub v2): what an agent finds of a
 * brand from its domain alone, scored on the same scale as the Brand Agent
 * Score in the app (lib/readiness.ts). The rules an agent reads weigh what
 * they weigh there: colors, typefaces, a logo with its file, a voice, and
 * rules served in a form a machine reads (a brand.json, or a BrandHub
 * listing), where the app counts a release. Pages, a look and a portal are
 * for people, so they don't count here; what only a domain can offer does:
 * an llms.txt at its root, design tokens, and an MCP server that answers.
 * 100 in all.
 *
 * lib/core/agent-score.ts fetches; this decides. Pure: `pnpm test` runs it
 * under plain Node.
 */

export type CheckId = "colors" | "type" | "logo" | "voice" | "rules" | "llms" | "tokens" | "mcp";

export const CHECK_WEIGHTS: Record<CheckId, number> = {
  colors: WEIGHTS.colors,
  type: WEIGHTS.type,
  logo: WEIGHTS.logo,
  voice: WEIGHTS.voice,
  rules: WEIGHTS.publish,
  llms: 10,
  tokens: 5,
  mcp: 5,
};

/** A rule as a brand.json or a listing names it: only its key, its type and whether it has files are read. */
export type FoundRule = { key: string; type: string; assets?: readonly unknown[] };

/** What was found at a domain. */
export type Found = {
  domain: string;
  /** Its /llms.txt, when it answered with text. */
  llms: string | null;
  /** Rules read from a brand.json it links or serves. */
  brandJson: { url: string; rules: FoundRule[] } | null;
  /** A public BrandHub listing of an organization that proved it holds the domain. */
  listing: { url: string; name: string; rules: FoundRule[] } | null;
  /** An MCP server its llms.txt names, and whether it answered. */
  mcp: { url: string; reachable: boolean } | null;
};

export type Check = { id: CheckId; title: string; done: boolean; detail: string; points: number };
export type Report = { domain: string; score: number; checks: Check[]; listing: Found["listing"] };

const URL_RE = /https?:\/\/[^\s<>"'`)\]]+/g;

/** Every absolute URL in a text, trailing punctuation off. */
export const linksIn = (text: string) => [...new Set((text.match(URL_RE) ?? []).map((u) => u.replace(/[.,;:!?]+$/, "")))];

/** The MCP server a text names: a URL with an `mcp` host label or path segment. */
export function mcpUrlIn(text: string) {
  return (
    linksIn(text).find((u) => {
      try {
        const { hostname, pathname } = new URL(u);
        return hostname.split(".").includes("mcp") || pathname.split("/").includes("mcp");
      } catch {
        return false;
      }
    }) ?? null
  );
}

/** A brand.json a text links, if any. */
export const brandJsonUrlIn = (text: string) => linksIn(text).find((u) => /\/brand\.json(\?|$)/.test(u)) ?? null;

/** Whether a text links design tokens: BrandHub's /tokens, or a tokens file. */
export const tokensIn = (text: string) => linksIn(text).some((u) => /\/tokens(\?|$|\.json)|design-tokens/i.test(u));

/** An AdCP brand.json (lib/brand-json.ts) as the rules it stands for: its colors, fonts, logos and voice. */
function adcpRules(o: { colors?: unknown; fonts?: unknown; logos?: unknown; tone?: unknown }): FoundRule[] {
  const keys = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? Object.keys(v) : []);
  const logos = Array.isArray(o.logos) ? o.logos.filter((l) => typeof l?.url === "string") : [];
  return [
    ...keys(o.colors).map((k) => ({ key: `color.${k}`, type: "color" })),
    ...keys(o.fonts).map((k) => ({ key: `type.${k}`, type: "font" })),
    ...logos.map((l, i) => ({ key: `logo.${i}`, type: "text", assets: [l.url] })),
    ...(o.tone ? [{ key: "tone.voice", type: "text" }] : []),
  ];
}

/**
 * The rules in a brand.json, leniently: an AdCP brand.json's colors, fonts,
 * logos and voice, BrandHub's rules.json (`{ data: { rules } }`), or
 * `{ rules }`, each with a key and a type. Null for anything else.
 */
export function rulesOf(json: unknown): FoundRule[] | null {
  const o = json as { data?: { rules?: unknown }; rules?: unknown; colors?: unknown; fonts?: unknown; logos?: unknown; tone?: unknown } | null;
  const list = o?.data?.rules ?? o?.rules ?? (o && typeof o === "object" ? adcpRules(o) : null);
  if (!Array.isArray(list)) return null;
  const rules = list.filter((r): r is FoundRule => !!r && typeof r.key === "string" && typeof r.type === "string");
  return rules.length ? rules : null;
}

/**
 * What an llms.txt says in words, when no rules come with it: a color as
 * #rrggbb, a typeface named, a logo with a file, a voice or tone.
 */
export function textSignals(text: string) {
  return {
    colors: /#[0-9a-f]{6}\b/i.test(text),
    type: /\b(typeface|font|typography)s?\b/i.test(text),
    logo: /\blogo/i.test(text) && linksIn(text).some((u) => /\.(svg|png|jpe?g|webp|pdf)(\?|$)|\/a\//i.test(u)),
    voice: /\b(voice|tone)\b/i.test(text),
  };
}

const TITLES: Record<CheckId, string> = {
  colors: "Colors",
  type: "Typefaces",
  logo: "Logo",
  voice: "Voice",
  rules: "Machine-readable rules",
  llms: "llms.txt",
  tokens: "Design tokens",
  mcp: "MCP server",
};

/** The score and each check, with what it adds once done. */
export function scoreFound(f: Found): Report {
  const rules = f.listing?.rules ?? f.brandJson?.rules ?? null;
  const steps = rules ? readiness({ rules, pages: [], versions: [], portals: null }).steps : null;
  const fromRules = (id: "colors" | "type" | "logo" | "voice") => !!steps?.find((s) => s.id === id)?.done;
  const words = f.llms ? textSignals(f.llms) : null;
  const where = f.listing ? "its BrandHub listing" : f.brandJson ? "its brand.json" : "its llms.txt";
  const has = (id: "colors" | "type" | "logo" | "voice") => fromRules(id) || (!rules && !!words?.[id]);
  const done: Record<CheckId, boolean> = {
    colors: has("colors"),
    type: has("type"),
    logo: has("logo"),
    voice: has("voice"),
    rules: !!rules,
    llms: !!f.llms,
    tokens: !!f.listing || (!!f.llms && tokensIn(f.llms)),
    mcp: !!f.mcp?.reachable,
  };
  const detail: Record<CheckId, [yes: string, no: string]> = {
    colors: [`Found in ${where}`, "No brand colors an agent can read: name them, as #rrggbb, in rules it can fetch."],
    type: [`Found in ${where}`, "No typefaces named: an agent will pick its own."],
    logo: [`Found in ${where}, with its file`, "No logo file an agent can fetch: link the file from the logo rule."],
    voice: [`Found in ${where}`, "Nothing says how the brand sounds: an agent writing for it will guess."],
    rules: [
      f.listing ? `Listed on BrandHub: ${f.listing.url}` : `At ${f.brandJson?.url}`,
      "No brand.json and no BrandHub listing: an agent gets prose at best, never the rules as data.",
    ],
    llms: [`At https://${f.domain}/llms.txt`, `Nothing at https://${f.domain}/llms.txt: the first place an agent looks.`],
    tokens: [f.listing ? "BrandHub serves them, in any format" : "Linked from its llms.txt", "No design tokens linked: a build can't take the colors and type as code."],
    mcp: [
      `${f.mcp?.url} answers`,
      f.mcp ? `${f.mcp.url}, named in its llms.txt, didn't answer.` : "No MCP server named in its llms.txt: an agent can't ask the brand questions.",
    ],
  };
  const checks = (Object.keys(CHECK_WEIGHTS) as CheckId[]).map((id) => ({
    id,
    title: TITLES[id],
    done: done[id],
    detail: detail[id][done[id] ? 0 : 1],
    points: CHECK_WEIGHTS[id],
  }));
  return { domain: f.domain, score: checks.reduce((n, c) => n + (c.done ? c.points : 0), 0), checks, listing: f.listing };
}

/**
 * The domain a person typed: a host name, or a URL's; lowercased, www. and
 * all but the host dropped. Null for what isn't a public-looking domain.
 */
export function domainOf(raw: string): string | null {
  let host = raw.trim().toLowerCase();
  if (!host) return null;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(host) ? host : `https://${host}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, "").replace(/\.$/, "");
  return host.length <= 253 && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) ? host : null;
}
