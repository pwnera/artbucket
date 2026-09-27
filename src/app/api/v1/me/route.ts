import { ok, route } from "@/lib/api";
import { describeCaller } from "@/lib/core/access";

/**
 * GET /api/v1/me - who is calling, in which workspace, with what scope, and
 * which workspaces it can switch to. Anyone may ask, even nobody: the answer
 * is how the app decides to show the sign-in page.
 */
export const GET = route(null, async (_req, _p, caller) => ok({ data: await describeCaller(caller) }));
