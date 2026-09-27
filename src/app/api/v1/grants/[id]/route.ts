import { z } from "zod";
import { ok, route } from "@/lib/api";
import { removeGrant } from "@/lib/core/people";

/** DELETE /api/v1/grants/{id} - take it away. The organization's last admin stays. */
export const DELETE = route<{ id: string }>(null, async (_req, { id }, caller) =>
  z.uuid().safeParse(id).success && (await removeGrant(caller, id)) ? ok({ data: { deleted: true } }) : null,
"No such grant");
