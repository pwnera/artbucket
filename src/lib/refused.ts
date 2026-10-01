/**
 * A value Postgres refuses, as the caller's mistake rather than the server's:
 * a NUL in text (22021) or in jsonb (22P05) is a bad request; text where a
 * uuid or a number goes (22P02), a path's id most often, names nothing.
 * A unique violation (23505) is two requests taking the same name, slug or
 * key at once, which a check before the write can't see: the loser's is taken.
 * A foreign key violation (23503) is a write pointing at a row deleted since it
 * was read (every foreign key cascades or sets null, so a delete never raises it): gone.
 * A deadlock (40P01) or a serialization failure (40001) is two changes
 * crossing: Postgres undid this one, so trying again works.
 * Drizzle wraps the driver's error, so its `cause` carries the code. An
 * update with nothing in it (a PATCH of `{}`) is drizzle's own refusal.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */
export function refusedValue(err: unknown): "invalid" | "not_found" | "empty" | "conflict" | "retry" | null {
  if (!err || typeof err !== "object") return null;
  if (err instanceof Error && err.message === "No values to set") return "empty";
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  const code = e.code ?? e.cause?.code;
  if (code === "23505") return "conflict";
  if (code === "40P01" || code === "40001") return "retry";
  return code === "22021" || code === "22P05" ? "invalid" : code === "22P02" || code === "23503" ? "not_found" : null;
}
