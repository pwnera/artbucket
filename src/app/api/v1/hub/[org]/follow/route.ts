import { ok, route } from "@/lib/api";
import { followOrg } from "@/lib/core/hub";

type P = { org: string };

/** PUT /api/v1/hub/{org}/follow - follow an organization: its brands show in your Following tab on BrandHub. */
export const PUT = route<P>(null, async (_req, { org }, caller) => ok({ data: await followOrg(caller, org, true) }));

/** DELETE /api/v1/hub/{org}/follow - stop following it. */
export const DELETE = route<P>(null, async (_req, { org }, caller) => ok({ data: await followOrg(caller, org, false) }));
