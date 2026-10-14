import { z } from "zod";
import { ok, route } from "@/lib/api";
import { testAutomation } from "@/lib/core/automations";

/** POST /api/v1/automations/{id}/test - send it now with a sample event, kept in its run log as a test. */
export const POST = route<{ id: string }>("automation.manage", async (_req, { id }, caller) =>
  z.uuid().safeParse(id).success ? ok({ data: await testAutomation(caller, id) }, { status: 201 }) : null,
"No such automation");
