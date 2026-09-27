/**
 * Which databases sweep a bucket. Each one's sweeper (lib/core/sweep.ts)
 * keeps a marker at `sweep-owners/{its instance id}`, holding its APP_URL,
 * and deletes nothing while a marker names another: a sweeper removes
 * whatever its own database doesn't hold, so two databases on one bucket
 * would remove each other's originals.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

export const OWNERS_PREFIX = "sweep-owners/";

export const ownerKey = (id: string) => `${OWNERS_PREFIX}${id}`;

/** The other databases whose markers are in the bucket, from the keys under OWNERS_PREFIX. */
export function strangers(keys: string[], self: string) {
  return keys.map((k) => k.slice(OWNERS_PREFIX.length)).filter((id) => id && id !== self);
}
