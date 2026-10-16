import { z } from "zod";
import { ok, route } from "@/lib/api";
import { rebuildSite } from "@/lib/core/rebuild";

/** POST /api/v1/sites/{id}/rebuild - call the site's deploy hook now, to build it again; `status` is what the hook answered. */
export const POST = route<{ id: string }>("portal.manage", async (_req, { id }, caller) => {
  const out = z.uuid().safeParse(id).success && (await rebuildSite(caller, id));
  return out ? ok({ data: out }) : null;
}, "No such site");
