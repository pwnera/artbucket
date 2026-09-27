import { body, ok, route } from "@/lib/api";
import { AssetError } from "@/lib/core/errors";
import { sendAs, testEmail } from "@/lib/core/mail";
import { EmailTest } from "@/lib/schemas";
import { can, needs } from "@/lib/permissions";

/** POST /api/v1/email/test - send a test through the organization's email settings, to you. Organization admin. */
export const POST = route(null, async (req, _p, caller) => {
  if (!can(caller, "organization.manage")) throw new AssetError("forbidden", `Testing email takes ${needs("organization.manage")}`);
  const to = (await body(req, EmailTest)).to ?? caller.user?.email;
  if (!to) throw new AssetError("invalid", "Say who to send it to");
  const r = await sendAs(caller.workspace.organizationId, testEmail(to, caller.workspace.organization.name));
  if (!r.sent) throw new AssetError("invalid", `Not sent: ${r.error}`);
  return ok({ data: { sent: true, to } });
});
