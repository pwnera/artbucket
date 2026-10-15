import { ok, route } from "@/lib/api";
import { brandTemplates } from "@/lib/core/office-templates";
import { checkFeature } from "@/lib/core/usage";
import { OfficeTemplatesQuery } from "@/lib/schemas";

/**
 * GET /api/v1/brand/office/templates?brand=acme&version=live - the brand's
 * own PowerPoint, Word and Excel templates: the Office files on its
 * release's rules, each with what in it won't follow the brand (colors and
 * faces written outside its theme, images the library doesn't know).
 */
export const GET = route("brand.read", async (req, _p, caller) => {
  await checkFeature(caller.project.organizationId, "templates");
  const q = new URL(req.url).searchParams;
  const { version } = OfficeTemplatesQuery.parse(Object.fromEntries(q));
  return ok({ data: await brandTemplates(caller, q.get("brand") ?? undefined, version) });
});
