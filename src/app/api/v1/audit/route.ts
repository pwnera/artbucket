import { ok, route } from "@/lib/api";
import { listAudit } from "@/lib/core/audit";
import { allows } from "@/lib/scopes";

/**
 * GET /api/v1/audit?before={time} - who changed who may do what: sign-ins,
 * members and grants, invitations, keys, share links, workspaces. An
 * organization admin reads the organization's; a workspace admin, the
 * workspace's.
 */
export const GET = route("admin", async (req, _p, caller) => {
  const p = new URL(req.url).searchParams;
  const orgAdmin = allows(caller.orgScope, "admin");
  return ok(
    await listAudit(
      { organizationId: caller.workspace.organizationId, workspaceId: orgAdmin ? undefined : caller.workspace.id },
      { before: p.get("before") ?? undefined, limit: Number(p.get("limit")) || undefined },
    ),
  );
});
