import { ok, route } from "@/lib/api";
import { listVersions } from "@/lib/core/brand";

/** GET /api/v1/brands/{slug}/versions - the brand's history, newest first. */
export const GET = route<{ slug: string }>("brand.read", async (_req, { slug }, caller) =>
  ok({ data: await listVersions(caller.project.id, slug) }),
);
