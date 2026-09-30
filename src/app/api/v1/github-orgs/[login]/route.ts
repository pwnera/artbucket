import { ok, route } from "@/lib/api";
import { removeGithub } from "@/lib/core/hub-trust";

/** DELETE /api/v1/github-orgs/{login} - it no longer proves anything for the organization. */
export const DELETE = route<{ login: string }>("organization.manage", async (_req, { login }, caller) =>
  (await removeGithub(caller, decodeURIComponent(login))) ? ok({ data: { deleted: true } }) : null,
"No such GitHub account");
