import { form, oauth } from "@/lib/api";
import { startDevice } from "@/lib/core/oauth";

/** POST /api/v1/oauth/device - RFC 8628: a code for a person to approve on /device. `artbucket login` starts here. */
export const POST = oauth(async (req) => startDevice((await form(req)).client_id ?? null));
