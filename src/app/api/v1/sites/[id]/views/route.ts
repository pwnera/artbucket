import { z } from "zod";
import { ok, route } from "@/lib/api";
import { portalViews } from "@/lib/core/usage";

/** GET /api/v1/sites/{id}/views - how often its pages were read over the last 30 days, per brand and page, most read first. */
export const GET = route<{ id: string }>("portal.manage", async (_req, { id }, caller) => {
  const data = z.uuid().safeParse(id).success && (await portalViews(caller, id));
  return data ? ok({ data }) : null;
}, "No such portal");
