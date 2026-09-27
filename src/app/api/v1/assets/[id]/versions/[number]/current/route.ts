import { ok, route } from "@/lib/api";
import { makeCurrent } from "@/lib/core/versions";

/**
 * POST /api/v1/assets/{id}/versions/{number}/current - roll back (or
 * forward): that approved version becomes the stack's current one, and
 * the others are superseded by it. Returns the versions.
 */
export const POST = route<{ id: string; number: string }>("asset.review", async (_req, { id, number }, caller) => {
  const versions = /^\d{1,9}$/.test(number) ? await makeCurrent(caller, id, Number(number)) : null;
  return versions && ok({ data: versions });
}, "No such asset");
