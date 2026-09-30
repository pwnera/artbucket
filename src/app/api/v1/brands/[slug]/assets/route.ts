import { ok, route } from "@/lib/api";
import { brandAssets } from "@/lib/core/brand-assets";

/**
 * GET /api/v1/brands/{slug}/assets - the files the brand uses: its rules'
 * files, then the ones its pages show, each with the rules and pages it is in.
 */
export const GET = route<{ slug: string }>("brand.read", async (_req, { slug }, caller) => ok({ data: await brandAssets(caller, slug) }));
