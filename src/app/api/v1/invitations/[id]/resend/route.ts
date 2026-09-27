import { z } from "zod";
import { ok, route } from "@/lib/api";
import { resendInvitation } from "@/lib/core/people";

/** POST /api/v1/invitations/{id}/resend - a new link and a new week, emailed when email is on. The old link stops working. */
export const POST = route<{ id: string }>(null, async (_req, { id }, caller) => {
  const inv = z.uuid().safeParse(id).success ? await resendInvitation(caller, id) : null;
  return inv && ok({ data: inv });
}, "No such invitation");
