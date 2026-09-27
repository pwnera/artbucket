/** The one error type core throws on purpose. lib/api.ts maps `code` to a status. */
export class AssetError extends Error {
  constructor(
    readonly code:
      | "not_found"
      | "too_large"
      | "unsupported"
      | "invalid"
      | "conflict"
      | "forbidden"
      /** A share link past its date. */
      | "gone"
      /** A share link's password is missing or wrong. */
      | "password"
      /** Past one of the organization's limits (lib/limits.ts). */
      | "limit_reached"
      /** The organization is read-only. */
      | "read_only"
      /** Too many tries: a share link's password. */
      | "rate_limited",
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
  }
}
