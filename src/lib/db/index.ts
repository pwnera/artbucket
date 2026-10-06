import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

// One pool per process. Next's dev server reloads modules, so stash it globally
// to avoid leaking connections on every hot reload.
const globalForDb = globalThis as unknown as { _sql?: ReturnType<typeof postgres> };

/**
 * Every connection is bounded, so one slow query or a transaction left open
 * can't keep one of the pool's ten: a query runs DATABASE_STATEMENT_TIMEOUT
 * at most, a transaction idles a minute at most, and a connection that can't
 * be made in ten seconds fails the request instead of queueing it. Long
 * maintenance runs through `unbounded`; migrations have a client of their own
 * (lib/db/migrate.ts) and no limit.
 */
const client =
  globalForDb._sql ??
  postgres(env.DATABASE_URL, {
    max: 10,
    connect_timeout: 10,
    connection: env.DATABASE_STATEMENT_TIMEOUT
      ? { statement_timeout: env.DATABASE_STATEMENT_TIMEOUT * 1000, idle_in_transaction_session_timeout: 60_000 }
      : {},
  });
if (process.env.NODE_ENV !== "production") globalForDb._sql = client;

export const db = drizzle(client, { schema });
export { schema };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Maintenance that may run past the statement timeout (the sweep, the Insights rollup): a transaction without one. */
export const unbounded = <T>(work: (tx: Tx) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout = 0`);
    return work(tx);
  });
