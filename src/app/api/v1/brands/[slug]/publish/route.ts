import { ok, route } from "@/lib/api";
import { publishBrand } from "@/lib/core/brand";
import { resolveBrand } from "@/lib/core/brands";
import { portalsShowing } from "@/lib/core/portals";
import { PublishInput } from "@/lib/schemas";

/**
 * POST /api/v1/brands/{slug}/publish - its latest version becomes the
 * published one, with an optional `{ note, image }` for readers. The body may
 * be left out. Publishing with nothing changed answers `unchanged`. `portals`:
 * where visitors now see it.
 */
export const POST = route<{ slug: string }>("brand.publish", async (req, { slug }, caller) => {
  const raw = await req.text();
  const published = await publishBrand(caller, slug, PublishInput.parse(raw ? JSON.parse(raw) : {}));
  const brand = await resolveBrand(caller.project.id, slug);
  return ok({ data: { ...published, portals: await portalsShowing(caller.project.id, brand.id) } });
});
