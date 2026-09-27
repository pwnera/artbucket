import { handle, ok } from "@/lib/api";
import { viewPortal } from "@/lib/core/portals";

/**
 * GET /api/v1/portal/{slug} - what a brand portal shows its visitor: itself,
 * themed, its collections, and a page of usable assets with their downloads.
 * Public; a password portal wants `X-Portal-Password`, an approved request's
 * link its key in `X-Portal-Key`, a members portal a signed-in session.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const q = new URL(req.url).searchParams;
    const data = await viewPortal(
      (await params).slug,
      { password: req.headers.get("x-portal-password"), key: req.headers.get("x-portal-key"), headers: req.headers },
      { q: q.get("q"), collection: q.get("collection"), limit: Number(q.get("limit")) || undefined, offset: Number(q.get("offset")) || undefined },
    );
    return ok(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    return handle(err);
  }
}
