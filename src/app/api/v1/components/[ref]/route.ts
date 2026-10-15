import { ok, route } from "@/lib/api";
import { componentOf } from "@/lib/core/components";

/** GET /api/v1/components/{id or address} - a component's versions, newest first, each with its preview and what is built with it. */
export const GET = route<{ ref: string }>("catalog.read", async (_req, { ref }, caller) => {
  const found = await componentOf(caller, decodeURIComponent(ref));
  return found && ok({ data: found });
});
