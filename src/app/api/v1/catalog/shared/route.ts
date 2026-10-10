import { ok, route } from "@/lib/api";
import { sharedHere } from "@/lib/core/catalog";

/** GET /api/v1/catalog/shared - what other projects shared into this one, each where it lives. */
export const GET = route("catalog.read", async (_req, _p, caller) => ok({ data: await sharedHere(caller) }));
