import { z } from "zod";
import { ok, route } from "@/lib/api";
import { revokeInvitation } from "@/lib/core/people";

/** DELETE /api/v1/invitations/{id} - withdraw one not yet taken. */
export const DELETE = route<{ id: string }>(null, async (_req, { id }, caller) =>
  z.uuid().safeParse(id).success && (await revokeInvitation(caller, id)) ? ok({ data: { deleted: true } }) : null,
"No such invitation");
