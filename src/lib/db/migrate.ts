import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { env } from "@/lib/env";

/**
 * Bring the database up to this version of the code before serving it: every
 * migration in drizzle/ not yet applied, in order, in one transaction. So any
 * release upgrades from any earlier one by starting it; `pnpm db:migrate` does
 * the same by hand. Migrations are only ever added, never edited once released
 * (CI refuses a change to one), which is what makes that promise hold.
 *
 * On its own connection, under a lock: several instances starting at once
 * take turns, and the later ones find nothing left to do.
 */
export async function migrateOnStart() {
  const sql = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    await sql`select pg_advisory_lock(72)`;
    await migrate(drizzle(sql), { migrationsFolder: path.join(process.cwd(), "drizzle") });
  } finally {
    await sql.end();
  }
}
