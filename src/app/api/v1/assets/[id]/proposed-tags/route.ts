import { body, narrow, ok, route } from "@/lib/api";
import { proposeTags } from "@/lib/core/assets";
import { ProposeTags } from "@/lib/schemas";

/**
 * POST /api/v1/assets/{id}/proposed-tags - suggest tags. They wait in
 * `proposedTags` until someone with the write scope accepts or dismisses them.
 */
export const POST = route<{ id: string }>(narrow("propose"), async (req, { id }, caller) => {
  const asset = await proposeTags(caller, id, (await body(req, ProposeTags)).tags);
  return asset && ok({ data: asset });
}, "No such asset");
