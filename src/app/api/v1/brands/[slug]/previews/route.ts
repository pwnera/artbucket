import { body, fail, ok, route } from "@/lib/api";
import { deletePreview, savePreview } from "@/lib/core/brand-sync";
import { BrandPreviewInput } from "@/lib/schemas";

type P = { slug: string };

/**
 * POST /api/v1/brands/{slug}/previews - a proposed change's files as a site
 * at a link, and what they would change. One per `ref`: saving again keeps
 * the link. Checked as an import is: a 422 lists every problem.
 */
export const POST = route<P>("brand.edit", async (req, { slug }, caller) => ok({ data: await savePreview(caller, slug, await body(req, BrandPreviewInput)) }));

/** DELETE /api/v1/brands/{slug}/previews?ref=pull/12 - its link stops opening: the change landed or was dropped. */
export const DELETE = route<P>("brand.edit", async (req, { slug }, caller) => {
  const ref = new URL(req.url).searchParams.get("ref");
  if (!ref) return fail(400, "invalid_request", "ref: the preview's ref, e.g. pull/12");
  return (await deletePreview(caller, slug, ref)) ? new Response(null, { status: 204 }) : fail(404, "not_found", `No preview ${ref}`);
});
