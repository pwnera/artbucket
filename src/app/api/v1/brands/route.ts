import { body, ok, route } from "@/lib/api";
import { makeBrand } from "@/lib/core/templates";
import { listBrands } from "@/lib/core/brands";
import { BrandCreate } from "@/lib/schemas";

/** GET /api/v1/brands - the default first. */
export const GET = route("brand.read", async (_req, _p, caller) => ok({ data: await listBrands(caller.project.id, caller) }));

/** POST /api/v1/brands - empty, `from` another brand's current rules, or from a `template`. */
export const POST = route("brand.create", async (req, _p, caller) =>
  ok({ data: await makeBrand(caller, await body(req, BrandCreate)) }, { status: 201 }),
);
