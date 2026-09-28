import { handle, ok } from "@/lib/api";
import { passOf, viewPortalBrand } from "@/lib/core/portals";

/**
 * GET /api/v1/portal/{slug}/brands/{brand} - one of a portal's brands, its
 * guidelines read-only as its latest publish has them, behind the same door
 * as the portal itself.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; brand: string }> }) {
  try {
    const { slug, brand } = await params;
    const data = await viewPortalBrand(slug, passOf(req), brand, { context: new URL(req.url).searchParams.get("context") });
    return ok(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    return handle(err);
  }
}
