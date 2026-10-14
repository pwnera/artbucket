import { handle, ok } from "@/lib/api";
import { passOf, portalTemplates } from "@/lib/core/portals";

/**
 * GET /api/v1/portal/{slug}/brands/{brand}/office/templates - one of a
 * portal's brands' own PowerPoint, Word and Excel templates, from its latest
 * publish, behind the same door as the portal: only files that may leave.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; brand: string }> }) {
  try {
    const { slug, brand } = await params;
    return ok({ data: await portalTemplates(slug, passOf(req), brand) });
  } catch (err) {
    return handle(err);
  }
}
