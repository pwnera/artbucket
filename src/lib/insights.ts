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
 * - tool: an MCP tool called, by name, and how it came out (Connections)
 * - lookup: an agent asking for the brand in a context (the context)
 * - view: kept for portal pages
 */
export const EVENT_KINDS = ["fetch", "check", "search", "view", "pull", "lookup", "tool"] as const;
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

/** Why a check said no (lib/rights.ts ReasonCode), as people read it; `scope`, a tool a key may not run (Connections). */
export const REASON: Record<string, string> = {
  not_approved: "Not approved",
  deleted: "Deleted",
  archived: "Archived",
  superseded: "Replaced",
  embargoed: "Under embargo",
  expired: "License expired",
  territory: "Territory",
  channel: "Channel",
  model_release: "Model release",
  context: "Wrong variant",
  scope: "Beyond its key",
};

/** An agent's events in a window, counted by what they say (lib/core/insights.ts connectionsOf). */
export type ClientRow = { client: string; kind: EventKind; subject: string | null; verdict: string | null; reasons: string[] | null; count: number };

/**
 * Connections (PRD): per agent, what it asked for, not only how often. The
 * MCP tools it called, most first, and how many failed or were refused; the
 * brand contexts it worked in; the uses it was refused, by reason (`scope`:
 * a tool its key may not run); files fetched and searches. Busiest first.
 */
export function connectionsOf(rows: ClientRow[]) {
  const by = new Map<string, ClientRow[]>();
  for (const r of rows) by.set(r.client, [...(by.get(r.client) ?? []), r]);
  const tally = (pairs: [string, number][]) => {
    const m = new Map<string, number>();
    for (const [k, n] of pairs) m.set(k, (m.get(k) ?? 0) + n);
    return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };
  const sum = (rs: ClientRow[]) => rs.reduce((t, r) => t + r.count, 0);
  return [...by]
    .map(([client, rs]) => {
      const tools = rs.filter((r) => r.kind === "tool" && r.subject);
      const failed = new Map(tally(tools.filter((r) => r.verdict !== "ok").map((r) => [r.subject!, r.count])));
      const refusals = [
        ...rs.filter((r) => r.kind === "check" && r.verdict === "refused").flatMap((r) => (r.reasons ?? []).map((code): [string, number] => [code, r.count])),
        ...tools.filter((r) => r.verdict === "refused").map((r): [string, number] => ["scope", r.count]),
      ];
      return {
        client,
        events: sum(rs),
        tools: tally(tools.map((r) => [r.subject!, r.count])).map(([name, calls]) => ({ name, calls, failed: failed.get(name) ?? 0 })),
        contexts: tally(rs.filter((r) => (r.kind === "check" || r.kind === "lookup") && r.subject).map((r) => [r.subject!, r.count])).map(([context, count]) => ({ context, count })),
        refusals: {
          total: sum(rs.filter((r) => (r.kind === "check" && r.verdict === "refused") || (r.kind === "tool" && r.verdict === "refused"))),
          reasons: tally(refusals).map(([code, count]) => ({ code, count })),
        },
        fetches: sum(rs.filter((r) => r.kind === "fetch")),
        searches: sum(rs.filter((r) => r.kind === "search")),
      };
    })
    .sort((a, b) => b.events - a.events || a.client.localeCompare(b.client));
}
