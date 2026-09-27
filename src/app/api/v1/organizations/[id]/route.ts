import { body, ok, route } from "@/lib/api";
import { renameOrganization } from "@/lib/core/people";
import { OrganizationPatch } from "@/lib/schemas";

/** PATCH /api/v1/organizations/{id} - rename the current workspace's organization. Organization admin. */
export const PATCH = route<{ id: string }>(null, async (req, { id }, caller) => {
  const org = await renameOrganization(caller, id, (await body(req, OrganizationPatch)).name);
  return org && ok({ data: org });
}, "No such organization");
