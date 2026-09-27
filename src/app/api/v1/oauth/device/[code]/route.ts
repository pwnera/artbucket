import { body, ok, route } from "@/lib/api";
import { checkDevice, decideDevice } from "@/lib/core/oauth";
import { Consent } from "@/lib/oauth";

/** GET /api/v1/oauth/device/{code} - which client waits on this code, and what you can give it. Signed in. */
export const GET = route<{ code: string }>(null, async (_req, { code }, caller) => ok({ data: await checkDevice(caller, code) }));

/** POST /api/v1/oauth/device/{code} - approve it (a workspace and a scope) or turn it down. */
export const POST = route<{ code: string }>(null, async (req, { code }, caller) =>
  ok({ data: await decideDevice(caller, code, await body(req, Consent)) }),
);
