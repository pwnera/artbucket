import type { Asset } from "@/components/gallery";

const patch = (a: Asset, body: object) =>
  fetch(`/api/v1/assets/${a.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

/**
 * What approving sends: the asset (a proposal or a draft) goes live with every
 * tag and value suggested for it. `overrides` is what the viewer's form says
 * instead: the tags on screen, and the values typed over the suggestions.
 */
export function approveBody(a: Asset, overrides: { tags?: string[]; fields?: Record<string, unknown> } = {}) {
  const fields = overrides.fields ?? a.proposedFields ?? {};
  return {
    ...((a.status === "proposed" || a.status === "draft") && { status: "active" as const }),
    tags: overrides.tags ?? [...new Set([...a.tags, ...a.proposedTags])],
    proposedTags: [],
    ...((Object.keys(fields).length || Object.keys(a.proposedFields ?? {}).length) && { fields, proposedFields: {} }),
  };
}

/** Approve takes the asset (a proposal or a draft) and every tag and value suggested for it. */
export const approve = (a: Asset) => patch(a, approveBody(a));

/** What waits on an approved asset, in words: "2 tags, 1 value"; empty when nothing does. */
export function suggestions(a: Asset) {
  const n = (count: number, what: string) => count && `${count} ${what}${count === 1 ? "" : "s"}`;
  return [n(a.proposedTags.length, "tag"), n(Object.keys(a.proposedFields ?? {}).length, "value")].filter(Boolean).join(", ");
}

/** Move it along its lifecycle: submit, archive, unarchive. */
export const moveTo = (a: Asset, status: Asset["status"]) => patch(a, { status });

/** Its last day of use, the rest of its rights as they are; null clears it. */
export const expireOn = (a: Asset, expires: string | null) => patch(a, { rights: { ...a.rights, expires } });

/** Reject turns a suggested asset down (kept, with the reason) or dismisses suggested tags and values. */
export const reject = (a: Asset, reason: string) =>
  patch(a, a.status === "proposed" ? { status: "rejected", reviewNote: reason || null } : { proposedTags: [], proposedFields: {} });
