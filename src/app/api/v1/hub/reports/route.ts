import { ok, route } from "@/lib/api";
import { listReports } from "@/lib/core/hub-trust";

/** GET /api/v1/hub/reports - reports and claims about the organization's BrandHub listings, open first. */
export const GET = route("organization.manage", async (_req, _p, caller) => ok({ data: await listReports(caller) }));
