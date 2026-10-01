import { ok, route } from "@/lib/api";
import { removeEmailDomain } from "@/lib/core/email-domains";

/** DELETE /api/v1/email-domains/{domain} - let it go; not while single sign-on uses it. */
export const DELETE = route<{ domain: string }>("organization.manage", async (_req, { domain }, caller) =>
  (await removeEmailDomain(caller, decodeURIComponent(domain))) ? ok({ data: { deleted: true } }) : null,
"No such email domain");
