import { ok, route } from "@/lib/api";
import { describeAsset, getAsset } from "@/lib/core/assets";

/**
 * GET /api/v1/assets/{id}/description - what the asset is, what it may be
 * rendered as, its rights and provenance. Its own URL, not an `Accept` on
 * /a/{id}: that one is cached forever by CDNs, which don't vary on Accept.
 */
export const GET = route<{ id: string }>("asset.read", async (_req, { id }, caller) => {
  const asset = await getAsset(caller, id);
  return asset && ok(describeAsset(asset), { headers: { "Cache-Control": "private, no-cache" } });
}, "No such asset");
