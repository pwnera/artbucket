import { ok, route, zipBody } from "@/lib/api";
import { checkBuild } from "@/lib/core/sites";

/**
 * POST /api/v1/sites/check - the body is a zip of a built site, hosted
 * anywhere. → { allowed, files, uses[], problems[] }: what it uses of the
 * project's library, found by its files' bytes and its /a/ and /c/
 * addresses, and why any of it may not be shown, as a deployment would be
 * checked. A question, not a change, so the read scope asks it.
 */
export const POST = route("asset.read", async (req, _p, caller) => ok({ data: await checkBuild(caller, await zipBody(req)) }));
