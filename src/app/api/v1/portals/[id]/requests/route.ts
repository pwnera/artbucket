import { z } from "zod";
import { ok, route } from "@/lib/api";
import { listRequests } from "@/lib/core/portals";

/** GET /api/v1/portals/{id}/requests - who asked in, newest first, and what became of it. */
export const GET = route<{ id: string }>("portal.manage", async (_req, { id }, caller) => {
  const data = z.uuid().safeParse(id).success && (await listRequests(caller, id));
  return data ? ok({ data }) : null;
}, "No such portal");
