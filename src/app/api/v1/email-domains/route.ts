import { body, ok, route } from "@/lib/api";
import { addEmailDomain, listEmailDomains } from "@/lib/core/email-domains";
import { EmailDomainInput } from "@/lib/schemas";

/** GET /api/v1/email-domains - the domains the organization's people have their email at, proved or not. */
export const GET = route("organization.manage", async (_req, _p, caller) => ok({ data: await listEmailDomains(caller) }));

/** POST /api/v1/email-domains - claim one; it counts once its TXT record is verified. */
export const POST = route("organization.manage", async (req, _p, caller) =>
  ok({ data: await addEmailDomain(caller, (await body(req, EmailDomainInput)).domain) }, { status: 201 }),
);
