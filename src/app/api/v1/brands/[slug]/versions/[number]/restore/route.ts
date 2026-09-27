import { ok, route } from "@/lib/api";
import { restoreVersion } from "@/lib/core/brand";

/** POST /api/v1/brands/{slug}/versions/{number}/restore - the restore is itself a new version. */
export const POST = route<{ slug: string; number: string }>("brand.edit", async (_req, { slug, number }, caller) => {
  const r = /^\d{1,9}$/.test(number) ? await restoreVersion(caller, slug, Number(number)) : null;
  return r && ok({ data: r });
}, "No such version");
