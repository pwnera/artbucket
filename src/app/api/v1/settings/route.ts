import { ok, route } from "@/lib/api";
import { contextOf, listSettings } from "@/lib/core/settings";

/**
 * GET /api/v1/settings?context=organization - every setting that can be set
 * there, as it applies, and where it comes from: the workspace, the
 * organization, the server's environment, or the default. Admin there.
 */
export const GET = route(null, async (req, _p, caller) => ok({ data: await listSettings(caller, contextOf(req)) }));
