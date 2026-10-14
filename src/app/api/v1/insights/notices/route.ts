import { body, ok, route } from "@/lib/api";
import { notifyStale } from "@/lib/core/insights";
import { InsightNotice } from "@/lib/schemas";

/**
 * POST /api/v1/insights/notices - `{ referrer | client, assets, emails? }`:
 * email a place that still loads replaced versions where the current ones
 * are. Each version and place is told once: a second time is a 409.
 */
export const POST = route("insights.read", async (req, _p, caller) => ok({ data: await notifyStale(caller, await body(req, InsightNotice)) }, { status: 201 }));
