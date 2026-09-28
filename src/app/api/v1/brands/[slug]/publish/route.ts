import { ok, route } from "@/lib/api";
import { publishBrand } from "@/lib/core/brand";
import { PublishInput } from "@/lib/schemas";

/**
 * POST /api/v1/brands/{slug}/publish - its latest version becomes the
 * published one, with an optional `{ note, image }` for readers. The body may
 * be left out. Publishing with nothing changed answers `unchanged`.
 */
export const POST = route<{ slug: string }>("brand.publish", async (req, { slug }, caller) => {
  const raw = await req.text();
  return ok({ data: await publishBrand(caller, slug, PublishInput.parse(raw ? JSON.parse(raw) : {})) });
});
