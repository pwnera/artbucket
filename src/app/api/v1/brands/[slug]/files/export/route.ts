import { body, ok, route } from "@/lib/api";
import { exportBrand } from "@/lib/core/brand-sync";
import { BrandExportInput } from "@/lib/schemas";

/**
 * POST /api/v1/brands/{slug}/files/export - the brand as files, given the
 * repository's as they are (`previous`): a file that says the same is kept as
 * it was written, so a sync rewrites only what changed.
 */
export const POST = route<{ slug: string }>("brand.read", async (req, { slug }, caller) =>
  ok({ data: await exportBrand(caller.workspace.id, slug, await body(req, BrandExportInput)) }),
);
