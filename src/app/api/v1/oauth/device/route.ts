import { form, oauth } from "@/lib/api";
import { startDevice } from "@/lib/core/oauth";

/** POST /api/v1/oauth/device - RFC 8628: a code for a person to approve on /device, offering `scope` first. `artbucket login` starts here. */
export const POST = oauth(async (req) => {
  const f = await form(req);
  return startDevice(f.client_id ?? null, f.scope);
});
