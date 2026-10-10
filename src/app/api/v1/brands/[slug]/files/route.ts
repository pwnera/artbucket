import { ok, route } from "@/lib/api";
import { exportBrand } from "@/lib/core/brand-sync";

/**
 * GET /api/v1/brands/{slug}/files?assets=files - the brand as files, for a
 * Git repository (lib/brand-files.ts): brand.yaml, rules/*.yaml, pages/*.yaml.
 * With assets=files, every asset it points at gets a path under assets/ to
 * fetch and add beside them.
 */
export const GET = route<{ slug: string }>("brand.read", async (req, { slug }, caller) => {
  const as = new URL(req.url).searchParams.get("assets");
  return ok({ data: await exportBrand(caller.project.id, slug, { assets: as === "files" ? "files" : "ids" }) });
});
