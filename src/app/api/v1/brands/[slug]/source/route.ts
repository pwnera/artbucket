import { body, fail, ok, route } from "@/lib/api";
import { deleteSource, getSource, setSource } from "@/lib/core/brand-sync";
import { BrandSourceInput } from "@/lib/schemas";

type P = { slug: string };

/**
 * GET /api/v1/brands/{slug}/source - the repository the brand's files live in
 * (null when none), whether it holds changes the files lack, and where this
 * server connects one (GIT_CONNECT_URL).
 */
export const GET = route<P>("brand.read", async (_req, { slug }, caller) => ok({ data: await getSource(caller.workspace.id, slug) }));

/** PUT /api/v1/brands/{slug}/source - where its files live; with `synced`, the files just pushed, as agreed. */
export const PUT = route<P>("brand.edit", async (req, { slug }, caller) => ok({ data: await setSource(caller, slug, await body(req, BrandSourceInput)) }));

/** DELETE /api/v1/brands/{slug}/source - the brand lives here alone again. Its repository is left as it is. */
export const DELETE = route<P>("brand.edit", async (_req, { slug }, caller) =>
  (await deleteSource(caller, slug)) ? new Response(null, { status: 204 }) : fail(404, "not_found", "This brand's files live nowhere else"),
);
