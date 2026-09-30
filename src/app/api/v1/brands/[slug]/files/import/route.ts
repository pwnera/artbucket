import { body, ok, route } from "@/lib/api";
import { importBrand } from "@/lib/core/brand-sync";
import { BrandImportInput } from "@/lib/schemas";

/**
 * POST /api/v1/brands/{slug}/files/import - take the brand from its files,
 * merged with what changed here since its source last agreed. A 422 lists
 * every problem at its file and line, and the files under assets/ to upload.
 */
export const POST = route<{ slug: string }>("brand.edit", async (req, { slug }, caller) =>
  ok({ data: await importBrand(caller, slug, await body(req, BrandImportInput)) }),
);
