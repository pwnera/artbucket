import { z } from "zod";
import { ok, route } from "@/lib/api";
import { closePortal } from "@/lib/core/portals";

/** POST /api/v1/sites/{id}/close - offline now; PATCH expiresAt: null opens it again. */
export const POST = route<{ id: string }>("portal.manage", async (_req, { id }, caller) => {
  const p = z.uuid().safeParse(id).success && (await closePortal(caller, id));
  return p ? ok({ data: p }) : null;
}, "No such portal");
