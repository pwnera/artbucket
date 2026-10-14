import { z } from "zod";
import { ok, route } from "@/lib/api";
import { listRuns } from "@/lib/core/automations";

/** GET /api/v1/automations/{id}/runs - its run log: the latest runs, each attempt with what it answered. */
export const GET = route<{ id: string }>("automation.manage", async (_req, { id }, caller) =>
  z.uuid().safeParse(id).success ? ok({ data: await listRuns(caller, id) }) : null,
"No such automation");
