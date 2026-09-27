import { ok, route } from "@/lib/api";
import { restoreVersion } from "@/lib/core/brand";
import { actorOf } from "@/lib/core/brands";

/** POST /api/v1/brands/{slug}/versions/{number}/restore - the restore is itself a new version. */
export const POST = route<{ slug: string; number: string }>("write", async (_req, { slug, number }, caller) => {
  const r = /^\d{1,9}$/.test(number) ? await restoreVersion(slug, Number(number), await actorOf(caller)) : null;
  return r && ok({ data: r });
}, "No such version");
