import { handle, ok } from "@/lib/api";
import { passOf, searchPortal } from "@/lib/core/portals";

/**
 * GET /api/v1/portal/{slug}/search?q=orange - search a portal: the pages and
 * rules of the brands it shows, as far as this visitor may read, and its
 * collections' assets.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const q = new URL(req.url).searchParams;
    const data = await searchPortal((await params).slug, passOf(req), { q: (q.get("q") ?? "").slice(0, 200), lang: q.get("lang") });
    return ok({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    return handle(err);
  }
}
