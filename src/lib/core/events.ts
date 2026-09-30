import { and, eq, gt, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { eventCounts, eventDays, events } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { EVENT_DAYS, PULL_DAYS, referrerHost, searchWords, type Actor, type Surface } from "@/lib/insights";

/**
 * Insights' one write (PRD INS-1 to INS-3): an event appended as something
 * happens, and rolled up by day once the day is over. What is recorded
 * stays in this server's database; nothing is ever sent anywhere, which is
 * the core's "no telemetry" promise. No IP address, no person's name, no
 * URL: lib/insights.ts says what is kept instead.
 */

export type Event = typeof events.$inferInsert;

/**
 * Append an event. Never awaited by the response, never fails it: an event
 * not recorded is logged and forgotten, like countTraffic's counters.
 *
 * ponytail: one insert per event. Buffer in memory and insert in batches
 * every few seconds if delivery traffic makes this the hot path.
 */
export function record(e: Event) {
  // After the response's own work, and whatever goes wrong goes wrong there, not in it.
  void Promise.resolve()
    .then(() => db.insert(events).values(e))
    .catch((err) => console.error("event not recorded", err));
}

/** Who a caller is, as an event keeps it: a kind, and an agent's key name. A person's name never. */
export const who = (caller: Pick<Caller, "key" | "user" | "actor"> | null | undefined): { actor: Actor; client: string | null } =>
  caller?.key ? { actor: "agent", client: caller.actor } : { actor: caller?.user ? "person" : "anonymous", client: null };

/**
 * A search, when it had words (INS search gaps): `found` or `empty`. Only a
 * first page counts, so paging on through results is one search.
 */
export function recordSearch(workspaceId: string, q: string | null | undefined, found: boolean, by: { surface: Surface } & ReturnType<typeof who>) {
  const subject = searchWords(q);
  if (subject) record({ workspaceId, kind: "search", ...by, subject, verdict: found ? "found" : "empty" });
}

/** A request's referrer, as an event keeps it: the host alone. */
export const referrerOf = (req: Request) => referrerHost(req.headers.get("referer"));

const today = sql`(now() at time zone 'utc')::date`;
/** The advisory lock class a rollup holds, so two instances don't roll the same days up twice. */
const ROLLUP_LOCK = 74;

/**
 * Roll every day not rolled up yet into event_days, up to the day before
 * yesterday: an event whose day was taken just before midnight may land a
 * moment after it, so a day is left to settle. Then drop raw events past
 * EVENT_DAYS. event_counts reads raw events for whatever is not rolled up,
 * so how often this runs changes nothing a chart shows. Runs with the sweep.
 */
export async function rollUp() {
  await db.transaction(async (tx) => {
    const [{ locked }] = await tx.execute<{ locked: boolean }>(sql`select pg_try_advisory_xact_lock(${ROLLUP_LOCK}, 0) as locked`);
    if (!locked) return;
    await tx
      .insert(eventDays)
      .select(
        tx
          .select()
          .from(eventCounts)
          .where(and(gt(eventCounts.day, sql`coalesce((select max(day) from ${eventDays}), '-infinity'::date)`), lt(eventCounts.day, sql`${today} - 1`))),
      );
    await tx.delete(events).where(lt(events.day, sql`${today} - ${EVENT_DAYS}::int`));
  });
}

/**
 * Each brand's pulls (its BrandHub files read: brand.json, llms.txt, tokens)
 * over the last `days` days, PULL_DAYS unless said: the count hub cards and
 * the brand's Overview show. Brands nobody pulled are left out.
 *
 * ponytail: read from event_counts on every hub page; keep a per-brand total
 * with the rollup if the hub grows past a few thousand listings.
 */
export async function pullCounts(brandIds: string[], days = PULL_DAYS) {
  const ids = [...new Set(brandIds)];
  if (!ids.length) return new Map<string, number>();
  const rows = await db
    .select({ id: eventCounts.brandId, n: sql<number>`sum(${eventCounts.count})::int` })
    .from(eventCounts)
    .where(and(inArray(eventCounts.brandId, ids), eq(eventCounts.kind, "pull"), gte(eventCounts.day, sql`${today} - ${days - 1}::int`)))
    .groupBy(eventCounts.brandId);
  return new Map(rows.map((r) => [r.id!, r.n]));
}
