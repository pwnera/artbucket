import { ok, route } from "@/lib/api";
import { listActivity } from "@/lib/core/activity";

/**
 * GET /api/v1/activity?before={time}&limit=50 - who did what, newest first:
 * assets added, suggested, approved, rejected and deleted, tags suggested, and
 * brand rule changes. `next` is the `before` of the following page.
 */
export const GET = route("read", async (req) => {
  const p = new URL(req.url).searchParams;
  return ok(await listActivity({ before: p.get("before") ?? undefined, limit: Number(p.get("limit")) || undefined }));
});
