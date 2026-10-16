import { ok, route } from "@/lib/api";
import { listProjectRequests, pendingRequests } from "@/lib/core/portals";

/**
 * GET /api/v1/sites/requests - every site's requests in the project, newest
 * first, each with its `site`. `?count=true`: only how many wait.
 */
export const GET = route("portal.manage", async (req, _params, caller) =>
  new URL(req.url).searchParams.get("count") === "true" ? ok({ data: { pending: await pendingRequests(caller) } }) : ok({ data: await listProjectRequests(caller) }),
);
