/** The one error type core throws on purpose. lib/api.ts maps `code` to a status. */
export class AssetError extends Error {
  constructor(
    readonly code: "not_found" | "too_large" | "unsupported" | "invalid" | "conflict",
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
  }
}
