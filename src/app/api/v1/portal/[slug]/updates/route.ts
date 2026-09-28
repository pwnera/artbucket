import { handle, ok } from "@/lib/api";
import { passOf, portalUpdates } from "@/lib/core/portals";

/**
 * GET /api/v1/portal/{slug}/updates?brand= - What's new in one of a portal's
 * brands, the first when not named: its publishes, newest first, each with
 * what it changed for readers since the one before.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const data = await portalUpdates((await params).slug, passOf(req), new URL(req.url).searchParams.get("brand"));
    return ok(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    return handle(err);
  }
}
