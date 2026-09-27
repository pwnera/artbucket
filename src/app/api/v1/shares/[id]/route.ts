import { z } from "zod";
import { ok, route } from "@/lib/api";
import { revokeShare } from "@/lib/core/shares";

/** DELETE /api/v1/shares/{id} - revoke it; the link stops working at once. */
export const DELETE = route<{ id: string }>("share.manage", async (_req, { id }, caller) =>
  z.uuid().safeParse(id).success && (await revokeShare(caller, id)) ? ok({ data: { deleted: true } }) : null,
"No such share link");
