import { route } from "@/lib/api";
import { officeResponse } from "@/lib/core/office";
import { brandTemplateFile } from "@/lib/core/office-templates";
import { OfficeTemplatesQuery } from "@/lib/schemas";

/**
 * GET /api/v1/brand/office/templates/{id}?brand=acme&version=live - one of
 * the brand's own templates wearing the release: its colors and families in
 * the file's theme, and each library image at its current version. The rest
 * of the file as its designer made it.
 */
export const GET = route<{ id: string }>("brand.read", async (req, { id }, caller) => {
  const q = new URL(req.url).searchParams;
  const { version } = OfficeTemplatesQuery.parse(Object.fromEntries(q));
  return officeResponse(req, await brandTemplateFile(caller, q.get("brand") ?? undefined, version, id));
});
