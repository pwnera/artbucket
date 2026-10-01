import { body, ok, route } from "@/lib/api";
import { makePrimary, removeDomain, useForApp } from "@/lib/core/domains";
import { DomainPatch } from "@/lib/schemas";

/** PATCH /api/v1/domains/{host} - use it for the app or stop (`app`), or make it the default of those (`primary`): where links in email point. */
export const PATCH = route<{ host: string }>("organization.manage", async (req, { host }, caller) => {
  const { app, primary } = await body(req, DomainPatch);
  const name = decodeURIComponent(host);
  let d = app === undefined ? null : await useForApp(caller, name, app);
  if (primary) d = await makePrimary(caller, name);
  return d ? ok({ data: d }) : null;
}, "No such domain");

/** DELETE /api/v1/domains/{host} - stop answering at a domain; a portal there goes back to /p/{slug}. */
export const DELETE = route<{ host: string }>("organization.manage", async (_req, { host }, caller) =>
  (await removeDomain(caller, decodeURIComponent(host))) ? ok({ data: { deleted: true } }) : null,
"No such domain");
