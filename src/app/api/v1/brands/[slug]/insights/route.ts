import { ok, route } from "@/lib/api";
import { brandInsights } from "@/lib/core/insights";

/**
 * GET /api/v1/brands/{slug}/insights - the brand's signals: BrandHub reads
 * of its files and portal page views of its pages over the last 30 days,
 * this week's answers from its files, and release adoption since its latest
 * release (lib/core/insights.ts brandInsights).
 */
export const GET = route<{ slug: string }>("insights.read", async (_req, { slug }, caller) => ok({ data: await brandInsights(caller, slug) }));
