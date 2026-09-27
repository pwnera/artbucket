import { z } from "zod";
import { body, ok, route } from "@/lib/api";
import { sendShare } from "@/lib/core/shares";
import { ShareSend } from "@/lib/schemas";

/** POST /api/v1/shares/{id}/send - `{ emails }`: email the link to them, through the organization's email. */
export const POST = route<{ id: string }>("share.manage", async (req, { id }, caller) => {
  const r = z.uuid().safeParse(id).success ? await sendShare(caller, id, (await body(req, ShareSend)).emails) : null;
  return r && ok({ data: r });
}, "No such share link");
