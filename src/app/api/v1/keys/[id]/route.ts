import { z } from "zod";
import { ok, route } from "@/lib/api";
import { revokeKey } from "@/lib/core/keys";

/** DELETE /api/v1/keys/{id} - revoke it. Requests using it get a 401 from now on. */
export const DELETE = route<{ id: string }>("key.manage", async (_req, { id }, caller) =>
  z.uuid().safeParse(id).success && (await revokeKey(caller, id)) ? ok({ data: { deleted: true } }) : null,
"No such key");
