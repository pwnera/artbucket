import { ok, route } from "@/lib/api";
import { restoreAsset } from "@/lib/core/assets";

/** POST /api/v1/assets/{id}/restore - undo a delete, within 30 days. */
export const POST = route<{ id: string }>("asset.delete", async (_req, { id }, caller) => {
  const asset = await restoreAsset(caller, id);
  return asset && ok({ data: asset });
}, "No such asset");
