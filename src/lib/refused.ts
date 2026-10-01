/**
 * A value Postgres refuses, as the caller's mistake rather than the server's:
 * a NUL in text (22021) or in jsonb (22P05) is a bad request; text where a
 * uuid or a number goes (22P02), a path's id most often, names nothing.
 * Drizzle wraps the driver's error, so its `cause` carries the code. An
 * update with nothing in it (a PATCH of `{}`) is drizzle's own refusal.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */
export function refusedValue(err: unknown): "invalid" | "not_found" | "empty" | null {
  if (!err || typeof err !== "object") return null;
  if (err instanceof Error && err.message === "No values to set") return "empty";
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  const code = e.code ?? e.cause?.code;
  return code === "22021" || code === "22P05" ? "invalid" : code === "22P02" ? "not_found" : null;
}
