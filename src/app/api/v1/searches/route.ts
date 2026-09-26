import { z } from "zod";
import { body, handle, ok } from "@/lib/api";
import { listSearches, saveSearch } from "@/lib/core/searches";

/** GET /api/v1/searches - run one with GET /api/v1/assets?{query}. */
export async function GET() {
  try {
    return ok({ data: await listSearches() });
  } catch (err) {
    return handle(err);
  }
}

const Save = z.strictObject({
  name: z.string().trim().min(1).max(120),
  /** An /api/v1/assets query string, e.g. "q=fox&f.channel=web". */
  query: z.string().max(4000),
});

/** POST /api/v1/searches */
export async function POST(req: Request) {
  try {
    return ok({ data: await saveSearch(await body(req, Save)) }, { status: 201 });
  } catch (err) {
    return handle(err);
  }
}
