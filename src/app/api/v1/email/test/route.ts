import { body, ok, route } from "@/lib/api";
import { AssetError } from "@/lib/core/errors";
import { appUrlFor } from "@/lib/core/domains";
import { sendAs, testEmail } from "@/lib/core/mail";
import { EmailTest } from "@/lib/schemas";
import { can, needs } from "@/lib/permissions";

/** POST /api/v1/email/test - send a test through the organization's email settings, to you only. Organization admin. */
export const POST = route(null, async (req, _p, caller) => {
  if (!can(caller, "organization.manage")) throw new AssetError("forbidden", `Testing email takes ${needs("organization.manage")}`);
  // Only to you: an admin's test is not a way to mail anyone.
  const to = caller.user?.email;
  if (!to) throw new AssetError("invalid", "A test goes to your own address: send it signed in, not with a key");
  const asked = (await body(req, EmailTest)).to;
  if (asked && asked.toLowerCase() !== to.toLowerCase()) throw new AssetError("invalid", `A test goes to your own address only (${to})`);
  const r = await sendAs(caller.project.organizationId, testEmail(to, caller.project.organization.name, await appUrlFor(caller.project.organizationId)));
  if (!r.sent) throw new AssetError(r.limited ? "rate_limited" : "invalid", `Not sent: ${r.error}`);
  return ok({ data: { sent: true, to } });
});
