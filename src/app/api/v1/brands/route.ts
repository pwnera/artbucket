import { body, ok, route } from "@/lib/api";
import { createBrand } from "@/lib/core/brand";
import { actorOf, listBrands } from "@/lib/core/brands";
import { BrandCreate } from "@/lib/schemas";

/** GET /api/v1/brands - the default first. */
export const GET = route("read", async () => ok({ data: await listBrands() }));

/** POST /api/v1/brands - empty, or `from` another brand's current rules. */
export const POST = route("write", async (req, _p, caller) =>
  ok({ data: await createBrand(await body(req, BrandCreate), await actorOf(caller)) }, { status: 201 }),
);
