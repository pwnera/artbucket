import { body, ok, route } from "@/lib/api";
import { createInvitation } from "@/lib/core/people";
import { InvitationInput } from "@/lib/schemas";

/**
 * POST /api/v1/invitations - invite someone by email to a scope on
 * something. The response has the link, once; send it to them. It lasts a week.
 */
export const POST = route(null, async (req, _p, caller) =>
  ok({ data: await createInvitation(caller, await body(req, InvitationInput)) }, { status: 201 }),
);
