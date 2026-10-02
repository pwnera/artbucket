import { ok, route } from "@/lib/api";
import { star } from "@/lib/core/hub";

type P = { org: string; brand: string };

/** PUT /api/v1/hub/{org}/{brand}/star - star a public listing: it shows in your Starred tab on BrandHub. */
export const PUT = route<P>(null, async (_req, { org, brand }, caller) => ok({ data: await star(caller, org, brand, true) }));

/** DELETE /api/v1/hub/{org}/{brand}/star - take the star back. */
export const DELETE = route<P>(null, async (_req, { org, brand }, caller) => ok({ data: await star(caller, org, brand, false) }));
