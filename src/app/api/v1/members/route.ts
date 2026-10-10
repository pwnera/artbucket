import { ok, route } from "@/lib/api";
import { listMembers } from "@/lib/core/people";

/**
 * GET /api/v1/members - the organization's people and their grants, and the
 * invitations still waiting. An organization admin sees every project's;
 * a project admin, the organization's and this project's. `?in=project`:
 * only who can open this project, and invitations into it.
 */
export const GET = route("member.manage", async (req, _p, caller) =>
  ok(await listMembers(caller, { here: new URL(req.url).searchParams.get("in") === "project" })),
);
