import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "drizzle-orm";
import { signUp } from "@/test/db";
import { db, unbounded } from "@/lib/db";
import { eventDays } from "@/lib/db/schema";
import { ROLLUP_DAYS } from "@/lib/insights";
import { rollUp } from "@/lib/core/events";

const ada = await signUp("Ada");

test("queries are bounded by the statement timeout, and maintenance isn't", async () => {
  const timeout = async (q: Pick<typeof db, "execute">) => (await q.execute<{ statement_timeout: string }>(sql`show statement_timeout`))[0].statement_timeout;
  assert.equal(await timeout(db), "15s");
  assert.equal(await unbounded(timeout), "0");
  assert.equal(await timeout(db), "15s");
});

test("the rollup drops days past ROLLUP_DAYS and keeps the rest", async () => {
  const day = (ago: number) => sql`(now() at time zone 'utc')::date - ${ago}::int`;
  const row = (ago: number) => ({ workspaceId: ada.caller.workspace.id, day: day(ago), kind: "fetch", surface: "app", actor: "person", count: 1 }) as const;
  await db.insert(eventDays).values([row(ROLLUP_DAYS + 1), row(ROLLUP_DAYS - 1)]);
  await rollUp();
  const left = await db.select({ day: sql<number>`(now() at time zone 'utc')::date - ${eventDays.day}` }).from(eventDays);
  assert.deepEqual(left.map((r) => r.day), [ROLLUP_DAYS - 1]);
});
