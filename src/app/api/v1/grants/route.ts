import { body, ok, route } from "@/lib/api";
import { setGrant } from "@/lib/core/people";
import { GrantInput } from "@/lib/schemas";

/**
 * POST /api/v1/grants - give a member a scope on the organization, a
 * project, a collection or an asset, or change it. Admin over that thing.
 */
export const POST = route(null, async (req, _p, caller) => ok({ data: await setGrant(caller, await body(req, GrantInput)) }));
