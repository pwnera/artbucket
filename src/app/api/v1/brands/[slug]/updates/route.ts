import { ok, route } from "@/lib/api";
import { listUpdates } from "@/lib/core/brand";
import { resolveBrand } from "@/lib/core/brands";

/**
 * GET /api/v1/brands/{slug}/updates - What's new: the brand's latest
 * publishes, newest first, each with what it changed for readers since the
 * publish before it.
 */
export const GET = route<{ slug: string }>("brand.read", async (_req, { slug }, caller) =>
  ok({ data: await listUpdates((await resolveBrand(caller.workspace.id, slug)).id) }),
);
