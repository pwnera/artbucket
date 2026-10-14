import { handle } from "@/lib/api";
import { officeResponse } from "@/lib/core/office";
import { passOf, portalOffice } from "@/lib/core/portals";
import { OfficeQuery } from "@/lib/schemas";

/**
 * GET /api/v1/portal/{slug}/brands/{brand}/office?format=potx - one of a
 * portal's brands as a PowerPoint or Word template, from its latest publish,
 * behind the same door as the portal itself.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; brand: string }> }) {
  try {
    const { slug, brand } = await params;
    const { format } = OfficeQuery.pick({ format: true }).parse(Object.fromEntries(new URL(req.url).searchParams));
    return officeResponse(req, await portalOffice(slug, passOf(req), brand, format));
  } catch (err) {
    return handle(err);
  }
}
