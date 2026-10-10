import { ok, route } from "@/lib/api";
import { queryFromParams } from "@/lib/catalog";
import { searchCatalog } from "@/lib/core/catalog";

/**
 * GET /api/v1/catalog?q=&type=&project=&status=&tag=&uses=&usedby=&admin=&limit=&cursor=
 * - search every type at once. `q` takes the same filters inline (`logo
 * status:current`); counts per type and project, retired matches counted aside.
 */
export const GET = route("catalog.read", async (req, _p, caller) => {
  const params = new URL(req.url).searchParams;
  const limit = Math.min(100, Math.max(1, Number(params.get("limit")) || 30));
  const cursor = Math.max(0, Number(params.get("cursor")) || 0);
  return ok(await searchCatalog(caller, queryFromParams(params), { limit, cursor }));
});
