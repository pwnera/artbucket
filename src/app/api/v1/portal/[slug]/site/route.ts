import { handle, ok } from "@/lib/api";
import { passOf, viewPortalSite } from "@/lib/core/portals";

/**
 * GET /api/v1/portal/{slug}/site?path=logo&context=&lang= - a page of a
 * portal's brand book, from its brand's latest publish, as this visitor may
 * read it: pages and sections above them are locked or left out, and every
 * asset URL comes signed. `path` is the portal path after /p/{slug}.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const q = new URL(req.url).searchParams;
    const data = await viewPortalSite((await params).slug, passOf(req), { path: q.get("path"), context: q.get("context"), lang: q.get("lang") });
    return ok({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    return handle(err);
  }
}
