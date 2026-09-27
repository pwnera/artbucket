import { handle, ok } from "@/lib/api";
import { viewShare } from "@/lib/core/shares";

/**
 * GET /api/v1/shared/{token} - what a share link shows: its name, what it is
 * of, and for a view link the approved assets with their download URLs.
 * Public; a link with a password wants it in `X-Share-Password`.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const q = new URL(req.url).searchParams;
    return ok(
      await viewShare((await params).token, req.headers.get("x-share-password"), {
        limit: Number(q.get("limit")) || undefined,
        offset: Number(q.get("offset")) || undefined,
      }),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    return handle(err);
  }
}
