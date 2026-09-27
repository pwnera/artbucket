export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { backfillPreviews } = await import("@/lib/core/previews");
  // Not awaited: the server serves while older files get their previews.
  backfillPreviews().catch((err) => console.warn("[artbucket] Preview backfill stopped:", err));
}
