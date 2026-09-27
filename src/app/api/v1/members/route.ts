import { ok, route } from "@/lib/api";
import { listMembers } from "@/lib/core/people";

/**
 * GET /api/v1/members - the organization's people and their grants, and the
 * invitations still waiting. An organization admin sees every workspace's;
 * a workspace admin, the organization's and this workspace's. `?in=workspace`:
 * only who can open this workspace, and invitations into it.
 */
export const GET = route("member.manage", async (req, _p, caller) =>
  ok(await listMembers(caller, { here: new URL(req.url).searchParams.get("in") === "workspace" })),
);
