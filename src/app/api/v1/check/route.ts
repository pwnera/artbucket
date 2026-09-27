import { body, ok, route } from "@/lib/api";
import { checkUse } from "@/lib/core/check";
import { CheckInput } from "@/lib/schemas";

/**
 * POST /api/v1/check  { asset, channel?, territory?, date?, context?, brand? }
 * → { allowed, reasons[], suggest[] }
 *
 * Whether this use of an asset is allowed: review status, replacement,
 * license window, territory, channel, model release, and the brand's variant
 * for the context. A question, not a change, so the read scope asks it.
 */
export const POST = route("asset.read", async (req, _p, caller) => ok(await checkUse(caller, await body(req, CheckInput))));
