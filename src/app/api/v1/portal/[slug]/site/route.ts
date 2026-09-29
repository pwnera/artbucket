import { handle, ok } from "@/lib/api";
import { findOf } from "@/lib/core/page-view";
import { passOf, viewPortalSite } from "@/lib/core/portals";
import { recordPageView } from "@/lib/core/usage";

/**
 * GET /api/v1/portal/{slug}/site?path=logo&context=&lang= - a page of a
 * portal's brand book, from its brand's latest publish, as this visitor may
 * read it: pages and sections above them are locked or left out, and every
 * asset URL comes signed. `path` is the portal path after /p/{slug}.
 * `in={section}&find=words` narrows that collection section's assets to the
 * words, a reader's search in it.
 *
 * A page shown counts as one view (lib/core/usage.ts). Not an error, a lock
 * or a redirect: the portal page follows a redirect and the page it lands on
 * counts. Not a HEAD either, which Next answers with this GET.
 * Prefetches can't be told apart here (the server page asks on the
 * browser's behalf), but the portal's own links don't prefetch.
 * ponytail: a book gathering its pages counts each, the client following an
 * old slug in place counts none, and bots count like anyone.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const q = new URL(req.url).searchParams;
    const find = findOf(q);
    const data = await viewPortalSite((await params).slug, passOf(req), { path: q.get("path"), context: q.get("context"), lang: q.get("lang"), ...find });
    // A search in a collection section reads the page again: not another view of it.
    if (req.method === "GET" && data.view?.page && !data.redirect && !find.find) recordPageView(data.portal.slug, data.view.brand.slug, data.view.page.slug);
    return ok({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    return handle(err);
  }
}
