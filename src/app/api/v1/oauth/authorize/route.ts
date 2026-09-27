import { z } from "zod";
import { body, ok, route } from "@/lib/api";
import { checkAuthorize, decideAuthorize } from "@/lib/core/oauth";
import { Consent } from "@/lib/oauth";

/**
 * GET /api/v1/oauth/authorize?{the client's authorize query} - who is asking
 * and what you can give it, for the consent screen at /oauth/authorize.
 */
export const GET = route(null, async (req, _p, caller) =>
  ok({ data: await checkAuthorize(caller, Object.fromEntries(new URL(req.url).searchParams)) }),
);

/** POST /api/v1/oauth/authorize - the decision, with the query it answers. Returns where to send the browser. */
export const POST = route(null, async (req, _p, caller) => {
  const { request, ...decision } = await body(req, z.object({ request: z.record(z.string(), z.string()) }).and(Consent));
  return ok({ data: await decideAuthorize(caller, request, decision) });
});
