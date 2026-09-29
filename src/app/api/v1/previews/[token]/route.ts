import { handle, ok } from "@/lib/api";
import { viewPreview } from "@/lib/core/brand-sync";
import { findOf } from "@/lib/core/page-view";

/**
 * GET /api/v1/previews/{token}?page=logo - a page of a preview, as its link
 * shows it: the brand as a proposed change's files say it. Public: the token
 * is the key, as a share link's is.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const q = new URL(req.url).searchParams;
    const data = await viewPreview((await params).token, q.get("page") || null, {
      context: q.get("context") || undefined,
      lang: q.get("lang") || undefined,
      ...findOf(q),
    });
    return ok({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    return handle(err);
  }
}
