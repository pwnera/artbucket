import { ok, route } from "@/lib/api";
import { assetInsights } from "@/lib/core/insights";

/**
 * GET /api/v1/assets/{id}/insights - where this asset is used: the brand
 * rules that point at it, the brand pages that show it, the public portals
 * it is on, and its fetches over the last 30 days by surface and referrer.
 */
export const GET = route<{ id: string }>("insights.read", async (_req, { id }, caller) => {
  const data = await assetInsights(caller, id);
  return data && ok({ data });
}, "No such asset");
