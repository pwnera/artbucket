import { body, ok, route } from "@/lib/api";
import { deleteAsset, getAsset, updateAsset } from "@/lib/core/assets";
import { actorOf } from "@/lib/core/brands";
import { AssetPatch } from "@/lib/schemas";

type P = { id: string };
const missing = "No such asset";

export const GET = route<P>("read", async (_req, { id }) => {
  const asset = await getAsset(id);
  return asset && ok({ data: asset });
}, missing);

/**
 * PATCH /api/v1/assets/{id}
 * `tags` replaces the whole set. `title`, `description`, `creator` and
 * `copyright` override what was read from the file; null clears one.
 * `fields` merges custom field values; null clears one unless it is required.
 * `status: "active"` promotes a proposed asset (its required fields must be
 * set by then); `status: "rejected"` with a `reviewNote` turns it down and
 * keeps it, so whoever proposed it can read why. `proposedTags` replaces the
 * pending suggestions, so accepting one is moving it into `tags`.
 */
export const PATCH = route<P>("write", async (req, { id }, caller) => {
  const asset = await updateAsset(id, await body(req, AssetPatch), await actorOf(caller));
  return asset && ok({ data: asset });
}, missing);

export const DELETE = route<P>("write", async (_req, { id }, caller) =>
  (await deleteAsset(id, await actorOf(caller))) ? ok({ data: { deleted: true } }) : null,
missing);
