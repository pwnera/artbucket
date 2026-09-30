import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { domains, organizations } from "@/lib/db/schema";
import { AssetError } from "@/lib/core/errors";
import { hubBrand, hubListings, hubOn } from "@/lib/core/hub";
import { brandJsonUrlIn, domainOf, mcpUrlIn, rulesOf, scoreFound, type Found, type Report } from "@/lib/agent-score";
import { fetchPublic } from "@/lib/fetch-public";
import { limiter } from "@/lib/rate";

/**
 * The public Brand Agent Score (/score on BrandHub): anyone names a domain,
 * the server looks for what an agent would find there, and lib/agent-score.ts
 * scores it. Thin and bounded, since a stranger triggers it: every fetch goes
 * through fetchPublic (public addresses only), small and quick, four at most
 * per domain; a domain's report is kept for a few minutes; and checks are
 * counted per address and in all. The address is only a key in memory.
 */

const FETCH = { maxBytes: 256 * 1024, timeoutMs: 4000, redirects: 3 };
/** However slowly an answer trickles, no fetch takes longer than this. */
const DEADLINE_MS = 6000;

const perAddress = limiter(10, 10 * 60_000);
const overall = limiter(200, 10 * 60_000);

// ponytail: per process, a few minutes, 500 domains at most; a shared cache once several instances serve the hub.
const CACHE_MS = 5 * 60_000;
const cache = new Map<string, { at: number; report: Report }>();

/** A URL's text, or null for anything that isn't an answer: not found, too big, too slow, a private address. */
async function text(url: string) {
  try {
    const r = await fetchPublic(url, { ...FETCH, signal: AbortSignal.timeout(DEADLINE_MS) });
    // A site answering every path with its home page answers nothing here.
    return r.mime === "text/html" ? null : r.bytes.toString("utf8");
  } catch {
    return null;
  }
}

/** Whether an MCP server answers at all: any status but a missing page or a failing server (a GET without a session is refused, and that is an answer). */
async function answers(url: string) {
  try {
    await fetchPublic(url, { ...FETCH, maxBytes: 16 * 1024, signal: AbortSignal.timeout(DEADLINE_MS), accept: (s) => s < 500 && s !== 404 });
    return true;
  } catch (err) {
    // An MCP stream that doesn't end, cut off at the size or the deadline, answered.
    return /Larger than/.test((err as Error).message);
  }
}

/** The public listing of an organization that proved it holds `domain` (or www. of it), as scored. */
async function listingFor(domain: string): Promise<Found["listing"]> {
  const [owner] = await db
    .select({ slug: organizations.slug })
    .from(domains)
    .innerJoin(organizations, eq(organizations.id, domains.organizationId))
    .where(and(inArray(domains.host, [domain, `www.${domain}`]), isNotNull(domains.verifiedAt)))
    .limit(1);
  if (!owner) return null;
  const [card] = (await hubListings({ org: owner.slug, limit: 5 })).filter((c) => c.visibility === "public");
  const b = card && (await hubBrand(card.org, card.brand));
  return b ? { url: b.url, name: b.name, rules: b.rules } : null;
}

/** Look at `raw` (a domain or a URL) as an agent would, and score it. */
export async function scoreDomain(raw: string, ip: string | null) {
  if (!hubOn()) throw new AssetError("not_found", "This server has no BrandHub");
  const domain = domainOf(raw);
  if (!domain) throw new AssetError("invalid", `Not a domain: "${raw.slice(0, 100)}". Say example.com`);
  const kept = cache.get(domain);
  if (kept && Date.now() - kept.at < CACHE_MS) return kept.report;
  const wait = perAddress.hit(ip ?? "?") || overall.hit("all");
  if (wait) throw new AssetError("rate_limited", `Too many checks. Try again in ${Math.ceil(wait / 60)} min`);

  const [llms, listing] = await Promise.all([text(`https://${domain}/llms.txt`), listingFor(domain)]);
  const jsonUrl = (llms && brandJsonUrlIn(llms)) ?? `https://${domain}/brand.json`;
  const mcpUrl = llms && mcpUrlIn(llms);
  const [json, reachable] = await Promise.all([listing ? null : text(jsonUrl), mcpUrl ? answers(mcpUrl) : false]);
  let rules = null;
  try {
    rules = json && rulesOf(JSON.parse(json));
  } catch {
    // Not JSON: no brand.json.
  }
  const report = scoreFound({
    domain,
    llms,
    brandJson: rules ? { url: jsonUrl, rules } : null,
    listing,
    mcp: mcpUrl ? { url: mcpUrl, reachable } : null,
  });
  if (cache.size >= 500) cache.clear();
  cache.set(domain, { at: Date.now(), report });
  return report;
}
