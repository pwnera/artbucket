import { ok, route } from "@/lib/api";
import { catalogTree } from "@/lib/core/catalog";

/** GET /api/v1/catalog/tree - every project the caller reaches, and its objects: the explorer's tree. */
export const GET = route("catalog.read", async (_req, _p, caller) => ok(await catalogTree(caller)));
