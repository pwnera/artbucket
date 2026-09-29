import { ok, route } from "@/lib/api";
import { brandStatus } from "@/lib/core/brand-status";

/**
 * GET /api/v1/brands/{slug}/status - the launch checklist: the essentials in
 * the rules, pages worth reading, whether readers see the latest, and the
 * portals showing it (for whoever manages portals). The builder's checklist
 * and the brand_status tool read the same thing.
 */
export const GET = route<{ slug: string }>("brand.read", async (_req, { slug }, caller) => ok({ data: await brandStatus(caller, slug) }));
