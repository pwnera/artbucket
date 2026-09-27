import { body, ok, route } from "@/lib/api";
import { proposeTags } from "@/lib/core/assets";
import { actorOf } from "@/lib/core/brands";
import { ProposeTags } from "@/lib/schemas";

/**
 * POST /api/v1/assets/{id}/proposed-tags - suggest tags. They wait in
 * `proposedTags` until someone with the write scope accepts or dismisses them.
 */
export const POST = route<{ id: string }>("propose", async (req, { id }, caller) => {
  const asset = await proposeTags(id, (await body(req, ProposeTags)).tags, await actorOf(caller));
  return asset && ok({ data: asset });
}, "No such asset");
