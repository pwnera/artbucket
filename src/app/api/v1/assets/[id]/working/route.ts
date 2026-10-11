import { body, ok, route } from "@/lib/api";
import { clearWorking, setWorking } from "@/lib/core/assets";
import { SetWorking } from "@/lib/schemas";

/**
 * PUT /api/v1/assets/{id}/working - say an agent is at work on the asset
 * ("suggesting tags"), for a while: the app shows it there, and looks again
 * until it ends. Its proposals end it, so does DELETE, so does the time.
 */
export const PUT = route<{ id: string }>("asset.propose_tags", async (req, { id }, caller) => {
  const asset = await setWorking(caller, id, await body(req, SetWorking));
  return asset && ok({ data: asset });
}, "No such asset");

/** DELETE /api/v1/assets/{id}/working - done, or given up: nothing is shown at work any more. */
export const DELETE = route<{ id: string }>("asset.propose_tags", async (_req, { id }, caller) => {
  const asset = await clearWorking(caller, id);
  return asset && ok({ data: asset });
}, "No such asset");
