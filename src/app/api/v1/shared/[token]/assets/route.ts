import { body, handle, ok } from "@/lib/api";
import { shareFinalize } from "@/lib/core/shares";
import { ShareFinalize } from "@/lib/schemas";

/**
 * POST /api/v1/shared/{token}/assets - hand in an upload. It lands proposed,
 * in the link's collection, for someone in the workspace to review.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const input = await body(req, ShareFinalize);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || null;
    return ok({ data: await shareFinalize((await params).token, req.headers.get("x-share-password"), input, ip) }, { status: 201 });
  } catch (err) {
    return handle(err);
  }
}
