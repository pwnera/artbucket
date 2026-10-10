import { ok, route } from "@/lib/api";
import { AssetError } from "@/lib/core/errors";
import { brandLookOf } from "@/lib/core/portals";

/**
 * GET /api/v1/sites/look?brand={slug} - the logo (an asset id) and accent
 * a portal showing this brand first wears where it sets none: the brand's
 * mark and color, from its live release.
 */
export const GET = route("portal.manage", async (req, _p, caller) => {
  const brand = new URL(req.url).searchParams.get("brand");
  if (!brand) throw new AssetError("invalid", "brand: the slug of the brand the portal shows first");
  return ok({ data: await brandLookOf(caller.project.id, brand) });
});
