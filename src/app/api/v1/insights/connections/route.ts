import { ok, route } from "@/lib/api";
import { connections } from "@/lib/core/insights";

/** GET /api/v1/insights/connections - per agent: the tools it called, the contexts it asked for, and its refusals. */
export const GET = route("insights.read", async (_req, _p, caller) => ok({ data: await connections(caller) }));
