import path from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import postgres from "postgres";
import { env } from "@/lib/env";

/**
 * Bring the database up to this version of the code before serving it: every
 * migration in drizzle/ not yet applied, in order, in one transaction. So any
 * release upgrades from any earlier one by starting it; `pnpm db:migrate` does
 * the same by hand. Migrations are only ever added, never edited once released
 * (CI refuses a change to one), which is what makes that promise hold.
 *
 * Under a lock taken inside that transaction, so it goes when the transaction
 * does: several instances starting at once take turns, and the later ones find
 * nothing left to do. A session lock would outlive the server behind a pooled
 * connection string (PgBouncer, Neon's -pooler) and hold every later start.
 * drizzle's own migrator reads what is applied outside its transaction, so
 * this does its steps itself, with its bookkeeping (drizzle.__drizzle_migrations).
 */
export async function migrateOnStart() {
  const migrations = readMigrationFiles({ migrationsFolder: path.join(process.cwd(), "drizzle") });
  const sql = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(72)`;
      await tx`create schema if not exists drizzle`;
      await tx`create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`;
      const [last] = await tx`select created_at from drizzle.__drizzle_migrations order by created_at desc limit 1`;
      for (const m of migrations) {
        if (last && Number(last.created_at) >= m.folderMillis) continue;
        for (const stmt of m.sql) await tx.unsafe(stmt);
        await tx`insert into drizzle.__drizzle_migrations (hash, created_at) values (${m.hash}, ${m.folderMillis})`;
      }
    });
  } finally {
    await sql.end();
  }
}
