import { ok, route } from "@/lib/api";
import { componentsOf } from "@/lib/core/components";

/** GET /api/v1/components - every component the project's Storybooks show now, at its current version. */
export const GET = route("catalog.read", async (_req, _p, caller) => ok({ data: await componentsOf(caller) }));
