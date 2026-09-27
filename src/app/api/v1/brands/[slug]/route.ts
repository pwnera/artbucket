import { body, narrow, ok, route } from "@/lib/api";
import { deleteBrand, listBrands, updateBrand } from "@/lib/core/brands";
import { BrandPatch } from "@/lib/schemas";

type P = { slug: string };

/** GET /api/v1/brands/{slug} */
export const GET = route<P>(narrow("read"), async (_req, { slug }, caller) => {
  const b = (await listBrands(caller.workspace.id)).find((x) => x.slug === slug);
  return b ? ok({ data: b }) : null;
}, "No such brand");

/** PATCH /api/v1/brands/{slug} - rename, change the slug, or `{ "default": true }`. */
export const PATCH = route<P>("write", async (req, { slug }, caller) =>
  ok({ data: await updateBrand(caller.workspace.id, slug, await body(req, BrandPatch)) }),
);

/** DELETE /api/v1/brands/{slug} - with its rules and history. Not the default. */
export const DELETE = route<P>("write", async (_req, { slug }, caller) => {
  await deleteBrand(caller.workspace.id, slug);
  return ok({ data: { deleted: true } });
});
