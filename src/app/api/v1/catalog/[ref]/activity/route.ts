import { ok, route } from "@/lib/api";
import { objectActivity } from "@/lib/core/catalog";

/** GET /api/v1/catalog/{id or address}/activity - what happened to it, newest first. */
export const GET = route<{ ref: string }>("catalog.read", async (_req, { ref }, caller) => {
  const found = await objectActivity(caller, decodeURIComponent(ref));
  return found && ok({ data: found });
});
