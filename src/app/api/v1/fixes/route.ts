import { ok, route } from "@/lib/api";
import { fixesOf } from "@/lib/core/fixes";

/** GET /api/v1/fixes - what needs doing in the project: places on old versions, searches that found nothing, licenses ending soon. */
export const GET = route("insights.read", async (_req, _p, caller) => ok({ data: await fixesOf(caller) }));
