export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Before anything is served: a failed migration stops the server rather than run it on the wrong schema.
  const { migrateOnStart } = await import("@/lib/db/migrate");
  await migrateOnStart();
  const [{ env }, { hasUsers }] = await Promise.all([import("@/lib/env"), import("@/lib/core/people")]);
  if (!env.SETUP_TOKEN && !(await hasUsers())) {
    console.warn("[artbucket] No account yet: the first one made, by anyone who reaches APP_URL, is the admin of everything. Make it now, or set SETUP_TOKEN.");
  }
  const { backfillPreviews } = await import("@/lib/core/previews");
  // Not awaited: the server serves while older files get their previews.
  backfillPreviews().catch((err) => console.warn("[artbucket] Preview backfill stopped:", err));
  const { scheduleSweep } = await import("@/lib/core/sweep");
  scheduleSweep();
}
