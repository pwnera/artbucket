import { body, ok, route } from "@/lib/api";
import { listSearches, saveSearch } from "@/lib/core/searches";
import { SaveSearch } from "@/lib/schemas";

/** GET /api/v1/searches - run one with GET /api/v1/assets?{query}. */
export const GET = route("read", async () => ok({ data: await listSearches() }));

/** POST /api/v1/searches */
export const POST = route("write", async (req) =>
  ok({ data: await saveSearch(await body(req, SaveSearch)) }, { status: 201 }),
);
