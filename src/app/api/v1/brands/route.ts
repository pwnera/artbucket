import { body, narrow, ok, route } from "@/lib/api";
import { createBrand } from "@/lib/core/brand";
import { listBrands } from "@/lib/core/brands";
import { BrandCreate } from "@/lib/schemas";

/** GET /api/v1/brands - the default first. */
export const GET = route(narrow("read"), async (_req, _p, caller) => ok({ data: await listBrands(caller.workspace.id) }));

/** POST /api/v1/brands - empty, or `from` another brand's current rules. */
export const POST = route("write", async (req, _p, caller) =>
  ok({ data: await createBrand(caller, await body(req, BrandCreate)) }, { status: 201 }),
);
