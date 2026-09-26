import { z } from "zod";
import { body, ok, route } from "@/lib/api";
import { setMembers } from "@/lib/core/collections";
import { MembersChange } from "@/lib/schemas";

/** POST /api/v1/collections/{id}/assets - `{ add: [...], remove: [...] }` in one call. */
export const POST = route<{ id: string }>("write", async (req, { id }) => {
  if (!z.uuid().safeParse(id).success) return null;
  await setMembers(id, await body(req, MembersChange));
  return ok({ data: { ok: true } });
}, "No such collection");
