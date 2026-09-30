import { ok, route } from "@/lib/api";
import { follow } from "@/lib/core/hub";

type P = { org: string; brand: string };

/** PUT /api/v1/hub/{org}/{brand}/follow - follow a public listing: it shows in your Following tab on BrandHub. */
export const PUT = route<P>(null, async (_req, { org, brand }, caller) => ok({ data: await follow(caller, org, brand, true) }));

/** DELETE /api/v1/hub/{org}/{brand}/follow - stop following it. */
export const DELETE = route<P>(null, async (_req, { org, brand }, caller) => ok({ data: await follow(caller, org, brand, false) }));
