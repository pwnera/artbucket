import { body, ok, route } from "@/lib/api";
import { proposeFields } from "@/lib/core/assets";
import { ProposeFields } from "@/lib/schemas";

/**
 * POST /api/v1/assets/{id}/proposed-fields - suggest custom field values. They
 * wait in `proposedFields` until someone with the write scope accepts or dismisses them.
 */
export const POST = route<{ id: string }>("asset.propose_fields", async (req, { id }, caller) => {
  const asset = await proposeFields(caller, id, (await body(req, ProposeFields)).fields);
  return asset && ok({ data: asset });
}, "No such asset");
