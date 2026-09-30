/**
 * Insights' words (PRD INS-1): what an event is, where it came in, and who
 * made it, as the events table (lib/db/schema.ts) stores them and
 * lib/core/events.ts records them. Nothing here names a person or an
 * address: who is a kind and, for an agent, its key's name; where from is a
 * host, never a URL.
 *
 * Relative imports only: `pnpm test` runs this under plain Node.
 */

/**
 * - fetch: a file served from /a/{id}
 * - check: a use asked about (check_use, POST /api/v1/check)
 * - search: words searched for, found or not
 * - pull: a BrandHub listing's file read (brand.json, llms.txt, tokens)
 * - view, lookup: kept for portal pages and agents' rule lookups
 */
export const EVENT_KINDS = ["fetch", "check", "search", "view", "pull", "lookup"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/**
 * Where it came in: the app, a key on the REST API, MCP, a portal, a share
 * link, BrandHub; for a file, `link` is a signed URL (handed out by a portal,
 * a share link, the hub or an agent) and `public` an asset made public.
 */
export const SURFACES = ["app", "api", "mcp", "portal", "share", "hub", "link", "public"] as const;
export type Surface = (typeof SURFACES)[number];

/** Who: a person signed in, an agent (an API key), or nobody in particular. */
export const ACTORS = ["person", "agent", "anonymous"] as const;
export type Actor = (typeof ACTORS)[number];

/** Raw events are kept this long; the daily rollup (event_days) stays. */
export const EVENT_DAYS = 90;

/**
 * The host a request came from, from its Referer, and nothing else of it:
 * no path, no query, no port (INS-2). Null for no referrer or one that is
 * not a web page.
 */
export function referrerHost(referer: string | null | undefined): string | null {
  if (!referer) return null;
  try {
    const u = new URL(referer);
    return u.protocol === "https:" || u.protocol === "http:" ? u.hostname.toLowerCase() || null : null;
  } catch {
    return null;
  }
}

/** A search's words as they are counted: trimmed, one space apart, lower case, 200 characters at most. Empty: not a search. */
export const searchWords = (q: string | null | undefined) => (q ?? "").trim().replace(/\s+/g, " ").toLowerCase().slice(0, 200);

/** Weekly charts cover this many weeks; lists, the last INSIGHT_DAYS days. */
export const WEEKS = 12;
export const INSIGHT_DAYS = 30;

/** The Monday (UTC) that starts the week of `d`, as YYYY-MM-DD: Postgres' date_trunc('week'). */
export function weekOf(d: Date): string {
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

/**
 * The last `weeks` weeks up to `now`'s, oldest first, each with its row or
 * `empty` where nothing happened: a chart's bars are the weeks, not the
 * weeks that had something in them.
 */
export function fillWeeks<T extends { week: string }>(rows: T[], empty: Omit<T, "week">, weeks = WEEKS, now = new Date()): T[] {
  const byWeek = new Map(rows.map((r) => [r.week, r]));
  const start = new Date(`${weekOf(now)}T00:00:00Z`);
  return Array.from({ length: weeks }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() - 7 * (weeks - 1 - i));
    const week = d.toISOString().slice(0, 10);
    return byWeek.get(week) ?? ({ ...empty, week } as T);
  });
}

/**
 * Whether a refused check's offer was taken: the same client (the same
 * agent's key, or nobody's for people and visitors) fetched the replacement,
 * or checked it and was allowed, after the refusal.
 */
export function taken(refusal: { at: Date; client: string | null }, offered: string, uses: { asset: string; client: string | null; at: Date }[]) {
  return uses.some((u) => u.asset === offered && u.client === refusal.client && u.at > refusal.at);
}
