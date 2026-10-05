import { today, type Rights } from "./rights.ts";

/**
 * An asset's lifecycle: draft, in review, approved, expired, archived. A
 * person decides `status`; expiry is a date (`rights.expires`), so `state`
 * derives it instead of a sweeper writing it, and it is never a day late.
 * Rejected is the review's other outcome, kept so an agent can read why.
 * Deleted is a time too (`deletedAt`): restorable until the sweeper purges it.
 *
 * `proposed` is "in review" and `active` is "approved": the API's names
 * since v0.4, kept so no client breaks.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

export const STATUSES = ["draft", "proposed", "active", "archived", "rejected"] as const;
export type Status = (typeof STATUSES)[number];

export const STATES = ["draft", "proposed", "active", "expired", "archived", "rejected", "deleted"] as const;
export type State = (typeof STATES)[number];

export const STATE_LABEL: Record<State, string> = {
  draft: "Draft",
  proposed: "In review",
  active: "Approved",
  expired: "Expired",
  archived: "Archived",
  rejected: "Rejected",
  deleted: "Deleted",
};

type Lived = { status: Status; rights: Pick<Rights, "expires" | "embargo"> | null; deletedAt?: Date | null };

/** Deleted over anything else; approved, until its last day of use has passed. */
export const stateOf = (a: Lived, day = today()): State =>
  a.deletedAt ? "deleted" : a.status === "active" && a.rights?.expires && day > a.rights.expires ? "expired" : a.status;

/** Whether /a/{id} serves it to anyone holding the URL: approved, unexpired, and out of embargo. */
export const deliverable = (a: Lived, day = today()) =>
  stateOf(a, day) === "active" && !(a.rights?.embargo && day < a.rights.embargo);

/** Gone for good, as far as the public is concerned: /a/{id} answers 410. */
export const retired = (a: Lived, day = today()) => ["expired", "archived", "deleted"].includes(stateOf(a, day));

const HOUR = 3600;

/**
 * How long a public cache may keep the bytes: an hour, and never past the end
 * of the last day of use, so an expiry takes effect everywhere on time. An
 * archive takes effect at the origin at once and in caches within the hour.
 *
 * ponytail: an hour is the ceiling on a takedown reaching CDNs; purge through
 * the CDN's API when one sits in front and that is too long.
 */
export function maxAge(a: Pick<Lived, "rights">, now = new Date()) {
  if (!a.rights?.expires) return HOUR;
  const end = Date.parse(`${a.rights.expires}T00:00:00Z`) + 24 * HOUR * 1000;
  return Math.max(0, Math.min(HOUR, Math.floor((end - now.getTime()) / 1000)));
}

/**
 * Whether moving from one status to another is a review decision (approve,
 * reject, archive, or taking an approved asset out of the library) or an
 * edit: submitting a draft, withdrawing a proposal to rework it.
 */
export const isReview = (from: Status, to: Status) =>
  !(to === "draft" || to === "proposed") || from === "active" || from === "archived";

/**
 * Whether this approves the caller's own proposal (a rejected one taken back
 * too). Whoever proposed it, a key or a person, never decides it: someone
 * else does (decision 0005). `proposedBy` is how history names them.
 */
export const approvesOwn = (a: { status: Status; proposedBy: string | null }, to: Status, actor: string) =>
  to === "active" && (a.status === "proposed" || a.status === "rejected") && a.proposedBy === actor;

/**
 * "Expires in 5 days": how an approved asset's last day of use reads when it
 * is close (within `within` days), so the library says so before a check has
 * to refuse it. Null when it is not approved, has no end, or is far off.
 */
export function expiring(a: Lived, day = today(), within = 30): string | null {
  const end = a.rights?.expires;
  if (!end || stateOf(a, day) !== "active") return null;
  const n = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000);
  return n > within ? null : n === 0 ? "Expires today" : n === 1 ? "Expires tomorrow" : `Expires in ${n} days`;
}
