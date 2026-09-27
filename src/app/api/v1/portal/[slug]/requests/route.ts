import { body, handle, ok } from "@/lib/api";
import { requestAccess } from "@/lib/core/portals";
import { PortalRequestInput } from "@/lib/schemas";

/**
 * POST /api/v1/portal/{slug}/requests - ask into a portal that isn't public.
 * The workspace's admins hear about it; it answers the same whoever asks.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const input = await body(req, PortalRequestInput);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || null;
    return ok({ data: await requestAccess((await params).slug, input, ip) }, { status: 202 });
  } catch (err) {
    return handle(err);
  }
}
