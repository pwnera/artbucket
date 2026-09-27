import { handle, ok } from "@/lib/api";
import { viewPortalBrand } from "@/lib/core/portals";

/**
 * GET /api/v1/portal/{slug}/brands/{brand} - one of a portal's brands, its
 * guidelines read-only, behind the same door as the portal itself.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; brand: string }> }) {
  try {
    const { slug, brand } = await params;
    const data = await viewPortalBrand(
      slug,
      { password: req.headers.get("x-portal-password"), key: req.headers.get("x-portal-key"), headers: req.headers },
      brand,
      { context: new URL(req.url).searchParams.get("context") },
    );
    return ok(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    return handle(err);
  }
}
