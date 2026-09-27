import type { Asset } from "@/components/gallery";

const patch = (a: Asset, body: object) =>
  fetch(`/api/v1/assets/${a.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

/** Approve takes the asset and every tag suggested for it. */
export const approve = (a: Asset) =>
  patch(a, {
    ...(a.status === "proposed" && { status: "active" }),
    tags: [...new Set([...a.tags, ...a.proposedTags])],
    proposedTags: [],
  });

/** Reject turns a suggested asset down (kept, with the reason) or dismisses suggested tags. */
export const reject = (a: Asset, reason: string) =>
  patch(a, a.status === "proposed" ? { status: "rejected", reviewNote: reason || null } : { proposedTags: [] });
