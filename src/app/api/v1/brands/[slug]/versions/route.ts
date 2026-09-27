import { ok, route } from "@/lib/api";
import { listVersions } from "@/lib/core/brand";

/** GET /api/v1/brands/{slug}/versions - the brand's history, newest first. */
export const GET = route<{ slug: string }>("read", async (_req, { slug }) => ok({ data: await listVersions(slug) }));
