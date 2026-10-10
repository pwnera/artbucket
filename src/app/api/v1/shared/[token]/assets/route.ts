import { body, handle, ok } from "@/lib/api";
import { ipOf } from "@/lib/client-ip";
import { shareFinalize } from "@/lib/core/shares";
import { ShareFinalize } from "@/lib/schemas";

/**
 * POST /api/v1/shared/{token}/assets - hand in an upload. It lands proposed,
 * in the link's collection, for someone in the project to review.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const input = await body(req, ShareFinalize);
    const ip = ipOf(req.headers);
    return ok({ data: await shareFinalize((await params).token, req.headers.get("x-share-password"), input, ip) }, { status: 201 });
  } catch (err) {
    return handle(err);
  }
}
