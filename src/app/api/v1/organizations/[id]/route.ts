import { body, ok, route } from "@/lib/api";
import { deleteOrganization, renameOrganization } from "@/lib/core/people";
import { OrganizationPatch } from "@/lib/schemas";

/** PATCH /api/v1/organizations/{id} - rename the current project's organization. Organization admin. */
export const PATCH = route<{ id: string }>(null, async (req, { id }, caller) => {
  const org = await renameOrganization(caller, id, (await body(req, OrganizationPatch)).name);
  return org && ok({ data: org });
}, "No such organization");

/** DELETE /api/v1/organizations/{id} - the current project's organization, with everything in it. Organization admin. */
export const DELETE = route<{ id: string }>(null, async (_req, { id }, caller) =>
  (await deleteOrganization(caller, id)) ? ok({ data: { deleted: true } }) : null,
"No such organization");
