import { ok, route } from "@/lib/api";
import { verifyAppDomain } from "@/lib/core/domains";

/** POST /api/v1/domains/{host}/verify - look for its TXT record, and CNAME, now; a 422 names what is missing. */
export const POST = route<{ host: string }>("organization.manage", async (_req, { host }, caller) => {
  const d = await verifyAppDomain(caller, decodeURIComponent(host));
  return d ? ok({ data: d }) : null;
}, "No such domain");
