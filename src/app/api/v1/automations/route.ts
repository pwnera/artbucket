import { body, ok, route } from "@/lib/api";
import { createAutomation, listAutomations } from "@/lib/core/automations";
import { AutomationInput } from "@/lib/schemas";

/** GET /api/v1/automations - the project's automations. Its admins. */
export const GET = route("automation.manage", async (_req, _p, caller) => ok({ data: await listAutomations(caller) }));

/** POST /api/v1/automations - make one; a webhook's secret is in the answer, once. */
export const POST = route("automation.manage", async (req, _p, caller) => ok({ data: await createAutomation(caller, await body(req, AutomationInput)) }, { status: 201 }));
