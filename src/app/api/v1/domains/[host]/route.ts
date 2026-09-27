import { ok, route } from "@/lib/api";
import { removeDomain } from "@/lib/core/domains";

/** DELETE /api/v1/domains/{host} - stop answering at an app domain. */
export const DELETE = route<{ host: string }>("organization.manage", async (_req, { host }, caller) =>
  (await removeDomain(caller, decodeURIComponent(host))) ? ok({ data: { deleted: true } }) : null,
"No such domain");
