import { body, ok, route } from "@/lib/api";
import { addDomain, listDomains } from "@/lib/core/domains";
import { DomainInput } from "@/lib/schemas";

/** GET /api/v1/domains - the organization's own addresses: the app's, and its portals'. */
export const GET = route("organization.manage", async (_req, _p, caller) => ok({ data: await listDomains(caller) }));

/**
 * POST /api/v1/domains - an address of the organization's own for the whole
 * app. It serves nothing until its TXT record is in place and verified.
 */
export const POST = route("organization.manage", async (req, _p, caller) =>
  ok({ data: await addDomain(caller, (await body(req, DomainInput)).host) }, { status: 201 }),
);
