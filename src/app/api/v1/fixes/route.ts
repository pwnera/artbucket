import { ok, route } from "@/lib/api";
import { fixesOf } from "@/lib/core/fixes";

/** GET /api/v1/fixes - what needs doing in the project: places on old versions, searches that found nothing, licenses ending soon. `?count=true`: `open` alone, for the sidebar. */
export const GET = route("insights.read", async (req, _p, caller) =>
  ok({ data: await fixesOf(caller, { count: new URL(req.url).searchParams.get("count") === "true" }) }),
);
