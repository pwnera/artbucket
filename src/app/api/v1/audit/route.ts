import { ok, route } from "@/lib/api";
import { listAudit } from "@/lib/core/audit";
import { can } from "@/lib/permissions";

/**
 * GET /api/v1/audit?before={time} - who changed who may do what: sign-ins,
 * members and grants, invitations, keys, share links, projects. An
 * organization admin reads the organization's, and their own sign-ins; a
 * project admin, the project's.
 */
export const GET = route("audit.read", async (req, _p, caller) => {
  const p = new URL(req.url).searchParams;
  const orgAdmin = can(caller, "organization.manage");
  return ok(
    await listAudit(
      { organizationId: caller.project.organizationId, projectId: orgAdmin ? undefined : caller.project.id, self: caller.user?.id },
      { before: p.get("before") ?? undefined, limit: Number(p.get("limit")) || undefined },
    ),
  );
});
