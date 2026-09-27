import { ok, route } from "@/lib/api";
import { usageOf } from "@/lib/core/usage";

/** GET /api/v1/usage - what the organization uses, against its limits. Organization admin. */
export const GET = route(null, async (_req, _p, caller) => ok({ data: await usageOf(caller) }));
