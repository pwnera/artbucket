import { ok, route } from "@/lib/api";
import { templateCatalog } from "@/lib/pages";

/**
 * GET /api/v1/brand/templates - the section templates pages are built from:
 * what each is for, what it binds, its props as JSON Schema and an example.
 * Under /brand/, not /brands/, where it would shadow a brand's slug.
 */
export const GET = route("brand.read", async () => ok({ data: templateCatalog() }));
