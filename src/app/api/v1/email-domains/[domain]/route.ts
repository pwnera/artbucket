import { body, ok, route } from "@/lib/api";
import { removeEmailDomain, setJoin } from "@/lib/core/email-domains";
import { EmailDomainPatch } from "@/lib/schemas";

/** PATCH /api/v1/email-domains/{domain} - let anyone at exactly this domain join, able to read its landing project, or stop it; or move where they land. */
export const PATCH = route<{ domain: string }>("organization.manage", async (req, { domain }, caller) => {
  const d = await setJoin(caller, decodeURIComponent(domain), await body(req, EmailDomainPatch));
  return d ? ok({ data: d }) : null;
}, "No such email domain");

/** DELETE /api/v1/email-domains/{domain} - let it go; not while single sign-on uses it. */
export const DELETE = route<{ domain: string }>("organization.manage", async (_req, { domain }, caller) =>
  (await removeEmailDomain(caller, decodeURIComponent(domain))) ? ok({ data: { deleted: true } }) : null,
"No such email domain");
