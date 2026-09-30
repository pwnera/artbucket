import { body, handle, ok } from "@/lib/api";
import { checkPortalUse, passOf } from "@/lib/core/portals";
import { PortalCheckInput } from "@/lib/schemas";

/**
 * POST /api/v1/portal/{slug}/check  { asset, channel?, territory?, date? }
 * → { allowed, reasons[], suggest[] }
 *
 * "Can I use this?" by a portal's download: one of the files it shows,
 * weighed for a use, behind the same door as the portal.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const input = await body(req, PortalCheckInput);
    return ok(await checkPortalUse((await params).slug, passOf(req), input), { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    return handle(err);
  }
}
