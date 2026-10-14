import { handle } from "@/lib/api";
import { officeResponse } from "@/lib/core/office";
import { passOf, portalTemplateFile } from "@/lib/core/portals";

/**
 * GET /api/v1/portal/{slug}/brands/{brand}/office/templates/{id} - one of
 * the brand's own templates wearing its latest publish, behind the portal's
 * door. `id` is the file's, or the one a rule names it by.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; brand: string; id: string }> }) {
  try {
    const { slug, brand, id } = await params;
    return officeResponse(req, await portalTemplateFile(slug, passOf(req), brand, id));
  } catch (err) {
    return handle(err);
  }
}
