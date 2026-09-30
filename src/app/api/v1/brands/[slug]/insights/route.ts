import { ok, route } from "@/lib/api";
import { brandInsights } from "@/lib/core/insights";

/**
 * GET /api/v1/brands/{slug}/insights - the brand's signals over the last 30
 * days: BrandHub reads of its files, and portal page views of its pages.
 */
export const GET = route<{ slug: string }>("insights.read", async (_req, { slug }, caller) => ok({ data: await brandInsights(caller, slug) }));
