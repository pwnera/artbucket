import { ok, route } from "@/lib/api";
import { insightsOf } from "@/lib/core/insights";

/**
 * GET /api/v1/insights - what the project's events say: brand answers per
 * week, release adoption and who is still on an old version, the most
 * fetched assets by surface, searches that found nothing, delivery traffic
 * and portal page views.
 */
export const GET = route("insights.read", async (_req, _p, caller) => ok({ data: await insightsOf(caller) }));
