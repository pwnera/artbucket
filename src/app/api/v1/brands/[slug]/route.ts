import { body, ok, route } from "@/lib/api";
import { brandTarget, deleteBrand, listBrands, resolveBrand, updateBrand } from "@/lib/core/brands";
import { keepReach } from "@/lib/core/people";
import { AssetError } from "@/lib/core/errors";
import { can, needs } from "@/lib/permissions";
import { BrandPatch } from "@/lib/schemas";

type P = { slug: string };

/** GET /api/v1/brands/{slug} */
export const GET = route<P>("brand.read", async (_req, { slug }, caller) => {
  const b = (await listBrands(caller.workspace.id, caller)).find((x) => x.slug === slug);
  return b ? ok({ data: b }) : null;
}, "No such brand");

/** PATCH /api/v1/brands/{slug} - rename, change the slug, or `{ "default": true }`. */
export const PATCH = route<P>("brand.edit", async (req, { slug }, caller) => {
  const patch = await body(req, BrandPatch);
  const done = await updateBrand(caller.workspace.id, slug, patch);
  // Made private, it stays in reach of whoever did it.
  if (patch.private) await keepReach(caller, "brand", (await resolveBrand(caller.workspace.id, done.slug)).id);
  return ok({ data: done });
});

/** DELETE /api/v1/brands/{slug} - with its rules and history. Not the default. */
export const DELETE = route<P>("brand.edit", async (_req, { slug }, caller) => {
  if (!can(caller, "brand.delete", await brandTarget(caller.workspace.id, new URL(_req.url)))) throw new AssetError("forbidden", `Deleting a brand takes ${needs("brand.delete")}`);
  await deleteBrand(caller.workspace.id, slug);
  return ok({ data: { deleted: true } });
});
