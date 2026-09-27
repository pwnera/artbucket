import { today, type Rights } from "./rights.ts";

/**
 * An asset's lifecycle: draft, in review, approved, expired, archived. A
 * person decides `status`; expiry is a date (`rights.expires`), so `state`
 * derives it instead of a sweeper writing it, and it is never a day late.
 * Rejected is the review's other outcome, kept so an agent can read why.
 *
 * `proposed` is "in review" and `active` is "approved": the API's names
 * since v0.4, kept so no client breaks.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

export const STATUSES = ["draft", "proposed", "active", "archived", "rejected"] as const;
export type Status = (typeof STATUSES)[number];

export const STATES = ["draft", "proposed", "active", "expired", "archived", "rejected"] as const;
export type State = (typeof STATES)[number];

export const STATE_LABEL: Record<State, string> = {
  draft: "Draft",
  proposed: "In review",
  active: "Approved",
  expired: "Expired",
  archived: "Archived",
  rejected: "Rejected",
};

type Lived = { status: Status; rights: Pick<Rights, "expires" | "embargo"> | null };

/** Approved, until its last day of use has passed. */
export const stateOf = (a: Lived, day = today()): State =>
  a.status === "active" && a.rights?.expires && day > a.rights.expires ? "expired" : a.status;

/** Whether /a/{id} serves it to anyone holding the URL: approved, unexpired, and out of embargo. */
export const deliverable = (a: Lived, day = today()) =>
  stateOf(a, day) === "active" && !(a.rights?.embargo && day < a.rights.embargo);

/** Gone for good, as far as the public is concerned: /a/{id} answers 410. */
export const retired = (a: Lived, day = today()) => ["expired", "archived"].includes(stateOf(a, day));

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
