import { z } from "zod";
import { body, narrow, ok, route } from "@/lib/api";
import { setMembers } from "@/lib/core/collections";
import { MembersChange } from "@/lib/schemas";

/** POST /api/v1/collections/{id}/assets - `{ add: [...], remove: [...] }` in one call. */
export const POST = route<{ id: string }>(narrow("write"), async (req, { id }, caller) => {
  if (!z.uuid().safeParse(id).success) return null;
  await setMembers(caller, id, await body(req, MembersChange));
  return ok({ data: { ok: true } });
}, "No such collection");
