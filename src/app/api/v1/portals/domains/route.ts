import { ok, route } from "@/lib/api";
import { portalDomains } from "@/lib/core/domains";

/** GET /api/v1/portals/domains - the organization's verified domains a portal may pick, and who has each. */
export const GET = route("portal.manage", async (_req, _p, caller) => ok({ data: await portalDomains(caller) }));
