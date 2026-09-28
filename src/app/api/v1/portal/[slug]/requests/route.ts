import { body, handle, ok } from "@/lib/api";
import { passOf, requestAccess } from "@/lib/core/portals";
import { PortalRequestInput } from "@/lib/schemas";

/**
 * POST /api/v1/portal/{slug}/requests - ask into a portal that isn't public,
 * or ask its brand team from a request section (`kind` asset, review or
 * question, with its `page` and `section`), through the site's own door.
 * The workspace's admins hear about it; it answers the same whoever asks.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const input = await body(req, PortalRequestInput);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || null;
    return ok({ data: await requestAccess((await params).slug, input, ip, passOf(req)) }, { status: 202, headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    return handle(err);
  }
}
