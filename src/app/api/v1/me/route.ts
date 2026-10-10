import { ok, route } from "@/lib/api";
import { describeCaller } from "@/lib/core/access";

/**
 * GET /api/v1/me - who is calling, in which project, with what scope, and
 * which projects it can switch to. Anyone may ask, even nobody: the answer
 * is how the app decides to show the sign-in page. Its sign-up check is the
 * host's (lib/auth.ts captchaAt).
 */
export const GET = route(null, async (req, _p, caller) =>
  ok({ data: await describeCaller(caller, req.headers.get("x-forwarded-host") ?? req.headers.get("host")) }),
);
