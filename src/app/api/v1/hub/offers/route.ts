import { ok, route } from "@/lib/api";
import { claimOffers } from "@/lib/core/hub-claims";

/** GET /api/v1/hub/offers - public listings of other organizations whose domain yours proves, to make yours. */
export const GET = route("organization.manage", async (_req, _p, caller) => ok({ data: await claimOffers(caller) }));
