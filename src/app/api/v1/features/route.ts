import { ok, route } from "@/lib/api";
import { contextOf } from "@/lib/core/settings";
import { listFeatures } from "@/lib/core/features";

/**
 * GET /api/v1/features?context=organization - every feature (the core's and
 * the server's), as it is switched there: at the organization, its rule and
 * in how many projects it is on; in the project, whether it is on and what
 * decides it. Admin there.
 */
export const GET = route(null, async (req, _p, caller) => ok({ data: await listFeatures(caller, contextOf(req)) }));
