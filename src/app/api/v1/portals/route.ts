import { body, ok, route } from "@/lib/api";
import { createPortal, listPortals } from "@/lib/core/portals";
import { PortalInput } from "@/lib/schemas";

/** GET /api/v1/portals - the project's brand portals. */
export const GET = route("portal.manage", async (_req, _p, caller) => ok({ data: await listPortals(caller) }));

/**
 * POST /api/v1/portals - a brand portal: chosen collections, themed, at
 * /p/{slug}, for people outside the team. Needs write on the project, and
 * sharing rights on each collection it shows.
 */
export const POST = route("portal.manage", async (req, _p, caller) =>
  ok({ data: await createPortal(caller, await body(req, PortalInput)) }, { status: 201 }),
);
