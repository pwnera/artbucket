import { body, ok, route } from "@/lib/api";
import { makePrimary, removeDomain } from "@/lib/core/domains";
import { DomainPatch } from "@/lib/schemas";

/** PATCH /api/v1/domains/{host} - make it the default: where links in email point. */
export const PATCH = route<{ host: string }>("organization.manage", async (req, { host }, caller) => {
  await body(req, DomainPatch);
  const d = await makePrimary(caller, decodeURIComponent(host));
  return d ? ok({ data: d }) : null;
}, "No such domain");

/** DELETE /api/v1/domains/{host} - stop answering at a domain; a portal there goes back to /p/{slug}. */
export const DELETE = route<{ host: string }>("organization.manage", async (_req, { host }, caller) =>
  (await removeDomain(caller, decodeURIComponent(host))) ? ok({ data: { deleted: true } }) : null,
"No such domain");
