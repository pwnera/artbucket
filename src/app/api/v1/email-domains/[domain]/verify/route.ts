import { ok, route } from "@/lib/api";
import { verifyEmailDomain } from "@/lib/core/email-domains";

/** POST /api/v1/email-domains/{domain}/verify - look for its TXT record now; a 422 names what is missing. */
export const POST = route<{ domain: string }>("organization.manage", async (_req, { domain }, caller) => {
  const d = await verifyEmailDomain(caller, decodeURIComponent(domain));
  return d ? ok({ data: d }) : null;
}, "No such email domain");
