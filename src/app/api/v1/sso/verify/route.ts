import { ok, route } from "@/lib/api";
import { verifySso } from "@/lib/core/sso";

/** POST /api/v1/sso/verify - look for the domain's TXT record now; a 422 names what is missing. */
export const POST = route("organization.manage", async (_req, _p, caller) => {
  const s = await verifySso(caller);
  return s ? ok({ data: s }) : null;
}, "No single sign-on here");
