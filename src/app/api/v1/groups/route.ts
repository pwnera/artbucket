import { body, ok, route } from "@/lib/api";
import { createGroup, listGroups } from "@/lib/core/groups";
import { GroupInput } from "@/lib/schemas";

/** GET /api/v1/groups - the organization's groups, their members and grants. */
export const GET = route(null, async (_req, _p, caller) => ok({ data: await listGroups(caller) }));

/** POST /api/v1/groups - make one. The organization's admins. */
export const POST = route(null, async (req, _p, caller) => ok({ data: await createGroup(caller, await body(req, GroupInput)) }, { status: 201 }));
