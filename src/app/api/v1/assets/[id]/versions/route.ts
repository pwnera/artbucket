import { ok, route } from "@/lib/api";
import { listVersions } from "@/lib/core/versions";

/**
 * GET /api/v1/assets/{id}/versions - every version of this asset, newest
 * first: the one `current` is what the library shows and share links serve.
 * An asset with one version lists itself. Add one with POST /api/v1/assets
 * and `versionOf`.
 */
export const GET = route<{ id: string }>("asset.read", async (_req, { id }, caller) => {
  const versions = await listVersions(caller, id);
  return versions && ok({ data: versions });
}, "No such asset");
