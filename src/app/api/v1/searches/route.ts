import { body, ok, route } from "@/lib/api";
import { listSearches, saveSearch } from "@/lib/core/searches";
import { SaveSearch } from "@/lib/schemas";

/** GET /api/v1/searches - run one with GET /api/v1/assets?{query}. */
export const GET = route("search.read", async (_req, _p, caller) => ok({ data: await listSearches(caller.workspace.id) }));

/** POST /api/v1/searches */
export const POST = route("search.save", async (req, _p, caller) =>
  ok({ data: await saveSearch(caller, await body(req, SaveSearch)) }, { status: 201 }),
);
